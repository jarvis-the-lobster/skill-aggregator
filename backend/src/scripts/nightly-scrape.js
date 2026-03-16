require('dotenv').config();

const db = require('../models/database');
const scraper = require('../services/scraperService');

const MAX_SKILLS_PER_RUN = parseInt(process.env.MAX_SKILLS_PER_RUN || '100');
const SCRAPE_DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '30000');
const STALE_THRESHOLD_MS = 23 * 60 * 60 * 1000; // 23 hours

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

  // Load all skills and filter to stale ones
  const allSkills = await db.query('SELECT * FROM skills');
  const now = Date.now();

  const stale = allSkills.filter((skill) => {
    if (!skill.last_scraped_at) return true;
    const age = now - new Date(skill.last_scraped_at).getTime();
    return age > STALE_THRESHOLD_MS;
  });

  stats.skipped = allSkills.length - stale.length;

  if (stale.length === 0) {
    console.log('✅ All skills are fresh — nothing to scrape.');
    await db.close();
    return;
  }

  const queue = shuffle(stale).slice(0, MAX_SKILLS_PER_RUN);
  console.log(
    `📋 ${allSkills.length} total skills | ${stale.length} stale | ${queue.length} queued | ${stats.skipped} fresh (skipped)\n`
  );

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

    console.log(`[${i + 1}/${queue.length}] Scraping: ${skill.id}`);
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
          await db.updateSkillLastScraped(skill.id);
        }
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
        await scraper.scrapeSkill(skill.id);
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

  await db.close();

  // Exit 1 if more than 20% of attempted skills failed
  if (stats.attempted > 0 && stats.failed / stats.attempted > 0.2) {
    console.error(`❌ Failure rate ${((stats.failed / stats.attempted) * 100).toFixed(1)}% exceeds 20% threshold.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in nightly scrape:', err.message);
  process.exit(1);
});
