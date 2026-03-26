// Only load dotenv when run directly (not when required by the server)
if (require.main === module) require('dotenv').config();

const db = require('../models/database');
const scraper = require('../services/scraperService');

const MAX_SKILLS_PER_RUN = parseInt(process.env.MAX_SKILLS_PER_RUN || '30');
const SCRAPE_DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '30000');
const STALE_THRESHOLD_DAYS = parseInt(process.env.STALE_THRESHOLD_DAYS || '7');
const STALE_THRESHOLD_MS = process.env.FORCE_SCRAPE_ALL === 'true' ? 0 : STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000; // default 7 days (or 0 to force all)
const LOW_CONTENT_THRESHOLD = parseInt(process.env.LOW_CONTENT_THRESHOLD || '20');
const NIGHTLY_QUOTA_BUDGET = parseInt(process.env.NIGHTLY_QUOTA_BUDGET || '5000'); // reserve ~5K for user searches

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function isQuotaExhausted(scrapedSkillIds) {
  if (scrapedSkillIds.length === 0) return false;
  const placeholders = scrapedSkillIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT status FROM scrape_log
     WHERE source = 'youtube'
       AND skill_id IN (${placeholders})
     ORDER BY scraped_at DESC
     LIMIT 50`,
    scrapedSkillIds
  );
  return rows.some((r) => r.status === 'quota_exceeded');
}

async function run() {
  console.log(`\n🌙 Nightly scrape started at ${new Date().toISOString()}`);
  console.log(`   Max skills: ${MAX_SKILLS_PER_RUN} | Delay between skills: ${SCRAPE_DELAY_MS}ms\n`);

  const stats = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    quota_exceeded: 0,
  };

  // Load all skills, scrape_log statuses, and content counts
  const allSkills = await db.query('SELECT * FROM skills');
  // Check the most recent scrape_log entry PER skill PER source.
  // A skill needs retry if ANY source's last entry is error/quota_exceeded.
  const lastScrapeStatuses = await db.query(
    `SELECT skill_id, source, status FROM scrape_log
     WHERE id IN (SELECT MAX(id) FROM scrape_log GROUP BY skill_id, source)`
  );
  // Build a map: skill_id -> true if any source failed
  const scrapeFailedMap = {};
  for (const row of lastScrapeStatuses) {
    if (row.status === 'error' || row.status === 'quota_exceeded') {
      scrapeFailedMap[row.skill_id] = true;
    }
  }
  const contentCounts = await db.query(
    `SELECT skill_id, COUNT(*) as cnt FROM content GROUP BY skill_id`
  );
  const contentCountMap = Object.fromEntries(
    contentCounts.map((r) => [r.skill_id, r.cnt])
  );
  const now = Date.now();

  // Priority tiers:
  // 1. Never scraped / error / quota_exceeded — always run first
  // 2. Stale (past threshold) — shuffled after priority skills
  // 3. Low content (<threshold) — backfill with remaining capacity
  const priority = [];  // never-scraped, error, quota_exceeded
  const stale = [];     // past staleness threshold
  const lowContent = [];

  for (const skill of allSkills) {
    // Tier 1: never scraped, failed scrape_log, or stuck in error/scraping
    if (!skill.last_scraped_at || scrapeFailedMap[skill.id] ||
        skill.status === 'error' || skill.status === 'scraping') {
      priority.push(skill);
      continue;
    }
    // Tier 2: stale
    const age = now - new Date(skill.last_scraped_at).getTime();
    if (age > STALE_THRESHOLD_MS) {
      stale.push(skill);
      continue;
    }
    // Tier 3: low content backfill
    const count = contentCountMap[skill.id] || 0;
    if (count < LOW_CONTENT_THRESHOLD) {
      lowContent.push(skill);
    }
  }

  stats.skipped = allSkills.length - priority.length - stale.length - lowContent.length;

  if (stale.length === 0 && lowContent.length === 0) {
    console.log('✅ All skills are fresh and well-stocked — nothing to scrape.');
    // Only close DB if running as a standalone script (not inline via server)
    if (require.main === module) await db.close();
    return;
  }

  // Priority skills always go first (never-scraped, error, quota_exceeded),
  // then stale, then low-content backfill with remaining capacity
  const priorityQueue = shuffle(priority);
  const staleQueue = shuffle(stale).slice(0, Math.max(0, MAX_SKILLS_PER_RUN - priorityQueue.length));
  const remainingSlots = MAX_SKILLS_PER_RUN - priorityQueue.length - staleQueue.length;
  const backfillQueue = remainingSlots > 0
    ? shuffle(lowContent).slice(0, remainingSlots)
    : [];

  // Budget-based queue sizing: cap total skills to what the quota budget can afford
  // Normal scrape ~120 units, expanded ~240 units
  const UNITS_NORMAL = 120;
  const UNITS_EXPANDED = 240;
  const maxAffordable = Math.floor(NIGHTLY_QUOTA_BUDGET / UNITS_NORMAL);
  const uncappedQueue = [...priorityQueue, ...staleQueue, ...backfillQueue];
  const queue = uncappedQueue.slice(0, Math.min(uncappedQueue.length, maxAffordable));

  if (queue.length < uncappedQueue.length) {
    console.log(`   ⚠️  Budget cap: ${uncappedQueue.length} skills queued but only ${queue.length} fit within ${NIGHTLY_QUOTA_BUDGET} unit budget`);
  }

  // Track which skills should use expanded YouTube search (low-content skills)
  // Allocate all queue as normal first, then upgrade some to expanded within remaining budget
  let budgetRemaining = NIGHTLY_QUOTA_BUDGET - (queue.length * UNITS_NORMAL);
  const extraCostPerExpand = UNITS_EXPANDED - UNITS_NORMAL; // 120 extra units per expanded skill

  const lowContentIds = new Set();

  // Prioritize backfill queue for expanded search
  for (const skill of backfillQueue) {
    if (!queue.includes(skill)) continue; // may have been trimmed by budget cap
    if (budgetRemaining < extraCostPerExpand) break;
    lowContentIds.add(skill.id);
    budgetRemaining -= extraCostPerExpand;
  }
  // Then stale skills with low content if there's still room
  for (const skill of staleQueue) {
    if (budgetRemaining < extraCostPerExpand) break;
    if ((contentCountMap[skill.id] || 0) < LOW_CONTENT_THRESHOLD) {
      lowContentIds.add(skill.id);
      budgetRemaining -= extraCostPerExpand;
    }
  }

  const normalCount = queue.length - lowContentIds.size;
  const estimatedQuota = (normalCount * UNITS_NORMAL) + (lowContentIds.size * UNITS_EXPANDED);
  console.log(
    `📋 ${allSkills.length} total skills | ${priority.length} priority (never-scraped/error) | ${stale.length} stale | ${lowContent.length} low-content (<${LOW_CONTENT_THRESHOLD}) | ${queue.length} queued (${priorityQueue.length} priority + ${staleQueue.length} stale + ${backfillQueue.length} backfill) | ${lowContentIds.size} expanded search | ${stats.skipped} fresh (skipped)`
  );
  console.log(`   Est. YouTube quota: ~${estimatedQuota} / ${NIGHTLY_QUOTA_BUDGET} budget (10K daily limit, rest reserved for user searches)\n`);

  const scrapedSkillIds = [];
  let youtubeAborted = false;

  for (let i = 0; i < queue.length; i++) {
    const skill = queue[i];
    const isLast = i === queue.length - 1;

    // Check quota before each skill (after the first)
    if (!youtubeAborted && scrapedSkillIds.length > 0) {
      youtubeAborted = await isQuotaExhausted(scrapedSkillIds);
      if (youtubeAborted) {
        console.warn('⚠️  YouTube quota exhausted — remaining skills will scrape articles only.');
      }
    }

    const isLowContent = lowContentIds.has(skill.id);
    console.log(`[${i + 1}/${queue.length}] Scraping: ${skill.id}${isLowContent ? ' (low content — expanded search)' : ''}`);
    stats.attempted++;

    // Guard: skip if already mid-scrape (shouldn't happen in nightly but be safe)
    if (skill.status === 'scraping') {
      console.log(`  ⏭  Already scraping, skipping.`);
      stats.skipped++;
      stats.attempted--;
      continue;
    }

    await db.updateSkillStatus(skill.id, 'scraping');

    try {
      if (youtubeAborted) {
        // Articles-only path: scrape without YouTube
        const articlesStart = Date.now();
        const articles = await scraper.scrapeArticles(skill.id);
        if (articles.length > 0) {
          const mapped = articles.map((a) => ({ ...a, type: 'article' }));
          await db.saveContent(mapped, skill.id);
        }
        // Always stamp last_scraped_at so skills don't loop forever with 0 results
        await db.updateSkillLastScraped(skill.id);
        await db.logScrape({
          skill_id: skill.id,
          source: 'nightly-articles-only',
          status: 'success',
          items_fetched: articles.length,
          quota_used: 0,
          duration_ms: Date.now() - articlesStart,
        });
        await db.updateSkillStatus(skill.id, 'ready');
      } else {
        await scraper.scrapeSkill(skill.id, { expandSearch: isLowContent });
        await db.updateSkillStatus(skill.id, 'ready');
      }

      console.log(`  ✅ Done`);
      stats.succeeded++;
      scrapedSkillIds.push(skill.id);
    } catch (err) {
      await db.updateSkillStatus(skill.id, 'error');
      console.error(`  ❌ Failed: ${err.message}`);
      stats.failed++;
      scrapedSkillIds.push(skill.id);

      // Re-check quota immediately after a failure
      const nowQuota = await isQuotaExhausted(scrapedSkillIds);
      if (nowQuota && !youtubeAborted) {
        youtubeAborted = true;
        stats.quota_exceeded++;
        console.warn('⚠️  YouTube quota exhausted — switching to articles-only for remaining skills.');
      }
    }

    if (!isLast) {
      console.log(`  ⏳ Waiting ${SCRAPE_DELAY_MS / 1000}s...\n`);
      await sleep(SCRAPE_DELAY_MS);
    }
  }

  // Summary
  console.log('\n─────────────────────────────────');
  console.log('📊 Nightly Scrape Summary');
  console.log('─────────────────────────────────');
  console.log(`  Attempted:      ${stats.attempted}`);
  console.log(`  Succeeded:      ${stats.succeeded}`);
  console.log(`  Failed:         ${stats.failed}`);
  console.log(`  Skipped (fresh):${stats.skipped}`);
  console.log(`  Quota exceeded: ${stats.quota_exceeded > 0 ? 'yes' : 'no'}`);
  console.log('─────────────────────────────────\n');

  // Only close DB if running as a standalone script
  if (require.main === module) await db.close();

  // Exit 1 if more than 20% of attempted skills failed (standalone only)
  if (require.main === module && stats.attempted > 0 && stats.failed / stats.attempted > 0.2) {
    console.error(`❌ Failure rate ${((stats.failed / stats.attempted) * 100).toFixed(1)}% exceeds 20% threshold.`);
    process.exit(1);
  }
}

// Export for inline use by the admin route
async function runNightlyScrape() {
  return run();
}

module.exports = { runNightlyScrape };

// Run directly when invoked as a script
if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error in nightly scrape:', err.message);
    process.exit(1);
  });
}
