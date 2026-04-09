const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireCronSecretMiddleware(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Accepts either CRON_SECRET or authenticated admin user
function requireCronSecretOrAdmin(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  // Allow CRON_SECRET bearer token
  if (secret && auth === `Bearer ${secret}`) {
    return next();
  }
  // Fall back to JWT + admin email check
  requireAuth(req, res, (err) => {
    if (err) return; // requireAuth already sent response
    if (!ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

// GET /api/admin/metrics — ops dashboard (CRON_SECRET or admin user)
router.get('/metrics', requireCronSecretOrAdmin, async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    res.json(metrics);
  } catch (err) {
    console.error('Admin metrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/admin/users — list all users (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, email, name AS display_name, created_at, last_login AS last_login_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/import-skills — run skills seed import (Bearer CRON_SECRET)
router.post('/import-skills', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db = require('../models/database');
    const skills = require('../data/skills-seed');
    let imported = 0, skipped = 0;
    for (const skill of skills) {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT OR IGNORE INTO skills (id, name, category, difficulty, description, estimated_hours) VALUES (?, ?, ?, ?, ?, ?)`,
          [skill.id, skill.name, skill.category, skill.difficulty, skill.description, skill.estimatedHours],
          function (err) {
            if (err) return reject(err);
            this.changes > 0 ? imported++ : skipped++;
            resolve();
          }
        );
      });
    }
    console.log(`[import-skills] Imported ${imported}, skipped ${skipped}`);
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    console.error('[import-skills] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scrape/nightly — trigger nightly scrape (Bearer CRON_SECRET)
router.post('/scrape/nightly', (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Run inline in the same process — detached child processes get killed in Railway containers
  const { runNightlyScrape } = require('../scripts/nightly-scrape');
  res.json({ ok: true, message: 'Nightly scrape started' });

  // Fire and forget — errors are logged internally
  runNightlyScrape().catch((err) => {
    console.error('[scrape/nightly] Fatal error:', err.message);
  });
});

// POST /api/admin/send-streak-reminders — send push reminders (Bearer CRON_SECRET)
router.post('/send-streak-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pushService = require('../services/pushService');

    // Get today's date in Pacific time (matches streak system)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    // Users with active streaks who haven't completed today
    const users = await db.query(
      `SELECT us.user_id, us.current_streak
       FROM user_streaks us
       INNER JOIN push_subscriptions ps ON ps.user_id = us.user_id
       WHERE us.current_streak > 0
         AND (us.last_activity_date IS NULL OR us.last_activity_date != ?)
       GROUP BY us.user_id`,
      [today]
    );

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const result = await pushService.sendStreakReminder(user.user_id, user.current_streak);
        sent += result.sent;
        failed += result.failed;
      } catch (err) {
        failed++;
        console.error(`[streak-reminders] Failed for user ${user.user_id}:`, err.message);
      }
    }

    console.log(`[streak-reminders] Sent ${sent}, failed ${failed}, users targeted ${users.length}`);
    res.json({ ok: true, usersTargeted: users.length, sent, failed });
  } catch (err) {
    console.error('[streak-reminders] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/test-push — send a test push to a user (Bearer CRON_SECRET)
router.post('/test-push', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const pushService = require('../services/pushService');
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = await pushService.sendPushToUser(userId, {
      title: '🔥 LearnStack Test',
      body: 'Push notifications are working! Keep learning.',
      icon: '/vite.svg',
      url: '/my-courses',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Skill Management ──────────────────────────────────────────────────────

// Helper: verify CRON_SECRET
function requireCronSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// DELETE /api/admin/skills/:id — delete a skill and all related data
router.delete('/skills/:id', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const skill = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (skill.length === 0) return res.status(404).json({ error: 'Skill not found' });

    await db.insert('DELETE FROM content WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_courses WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_plan_progress WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM scrape_log WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error('Delete skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/rename — rename a skill ID (moves all related data)
router.post('/skills/:id/rename', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { newId, newName } = req.body;
    if (!newId) return res.status(400).json({ error: 'newId required' });

    const existing = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Skill not found' });

    const conflict = await db.query('SELECT id FROM skills WHERE id = ?', [newId]);
    if (conflict.length > 0) return res.status(409).json({ error: `Skill '${newId}' already exists. Use merge instead.` });

    // Create new skill with old skill's data
    await db.insert(
      `INSERT INTO skills (id, name, category, difficulty, description, estimated_hours, status, last_scraped_at)
       SELECT ?, COALESCE(?, name), category, difficulty, description, estimated_hours, status, last_scraped_at
       FROM skills WHERE id = ?`,
      [newId, newName || null, id]
    );

    // Move all related data
    await db.insert('UPDATE content SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE learning_plans SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE user_courses SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE user_plan_progress SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE scrape_log SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({ ok: true, renamed: `${id} → ${newId}` });
  } catch (err) {
    console.error('Rename skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/merge — merge a skill into another (moves content, deletes source)
router.post('/skills/:id/merge', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });

    const source = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (source.length === 0) return res.status(404).json({ error: `Source skill '${id}' not found` });

    const target = await db.query('SELECT id FROM skills WHERE id = ?', [targetId]);
    if (target.length === 0) return res.status(404).json({ error: `Target skill '${targetId}' not found` });

    // Move content that doesn't already exist in target (avoid duplicates)
    await db.insert(
      `UPDATE content SET skill_id = ? WHERE skill_id = ? AND id NOT IN (SELECT id FROM content WHERE skill_id = ?)`,
      [targetId, id, targetId]
    );

    // Clean up remaining references
    await db.insert('DELETE FROM content WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM scrape_log WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_courses WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_plan_progress WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({ ok: true, merged: `${id} → ${targetId}` });
  } catch (err) {
    console.error('Merge skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/safe-merge — safe merge with dry-run support
router.post('/skills/:id/safe-merge', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { targetId, mode = 'dry-run', renameTargetName } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    if (id === targetId) return res.status(400).json({ error: 'sourceId and targetId must differ' });
    if (!['dry-run', 'execute'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be dry-run or execute' });
    }

    const skillMergeService = require('../services/skillMergeService');
    const result = await skillMergeService.safeMerge(id, targetId, {
      dryRun: mode !== 'execute',
      renameTargetName,
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    console.error('Safe merge error:', err.message);
    res.status(status).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/category — update a skill category
router.post('/skills/:id/category', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (typeof category !== 'string') {
      return res.status(400).json({ error: 'category string required' });
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (!normalizedCategory) {
      return res.status(400).json({ error: 'category cannot be empty' });
    }
    if (normalizedCategory.length > 64) {
      return res.status(400).json({ error: 'category too long' });
    }
    if (!/^[a-z0-9-]+$/.test(normalizedCategory)) {
      return res.status(400).json({ error: 'category must contain only lowercase letters, numbers, and hyphens' });
    }

    const existing = await db.query('SELECT id, category FROM skills WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Skill not found' });

    await db.insert('UPDATE skills SET category = ? WHERE id = ?', [normalizedCategory, id]);

    res.json({
      ok: true,
      skillId: id,
      previousCategory: existing[0].category || null,
      category: normalizedCategory
    });
  } catch (err) {
    console.error('Update skill category error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/reset-stale — reset last_scraped_at for low-content skills
router.post('/skills/reset-stale', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const threshold = parseInt(req.query.threshold || '30');
    const skills = await db.query(
      `SELECT s.id, COUNT(c.id) as content_count
       FROM skills s LEFT JOIN content c ON c.skill_id = s.id
       GROUP BY s.id HAVING content_count < ?`,
      [threshold]
    );
    const ids = skills.map(s => s.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await db.insert(`UPDATE skills SET last_scraped_at = NULL WHERE id IN (${placeholders})`, ids);
    }
    res.json({ ok: true, reset: ids.length, skills: ids });
  } catch (err) {
    console.error('Reset stale error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scrape/skills — scrape specific skills by ID (Bearer CRON_SECRET)
// Body: { "skillIds": ["linux", "supply-chain", "music-production"] }
router.post('/scrape/skills', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const { skillIds } = req.body;
  if (!Array.isArray(skillIds) || skillIds.length === 0) {
    return res.status(400).json({ error: 'skillIds array required' });
  }
  if (skillIds.length > 20) {
    return res.status(400).json({ error: 'Max 20 skills per request' });
  }

  // Validate all skills exist
  const placeholders = skillIds.map(() => '?').join(',');
  const existing = await db.query(`SELECT id FROM skills WHERE id IN (${placeholders})`, skillIds);
  const existingIds = new Set(existing.map(s => s.id));
  const missing = skillIds.filter(id => !existingIds.has(id));
  if (missing.length > 0) {
    return res.status(404).json({ error: `Skills not found: ${missing.join(', ')}` });
  }

  res.json({ ok: true, message: `Scraping ${skillIds.length} skill(s)`, skillIds });

  // Fire and forget
  const scraper = require('../services/scraperService');
  (async () => {
    for (const skillId of skillIds) {
      console.log(`[admin/scrape] Scraping: ${skillId}`);
      try {
        await db.updateSkillStatus(skillId, 'scraping');
        await scraper.scrapeSkill(skillId);
        await db.updateSkillStatus(skillId, 'ready');
        console.log(`[admin/scrape] ✅ ${skillId} done`);
      } catch (err) {
        await db.updateSkillStatus(skillId, 'error');
        console.error(`[admin/scrape] ❌ ${skillId}: ${err.message}`);
      }
    }
    console.log(`[admin/scrape] Finished all ${skillIds.length} skill(s)`);
  })().catch(err => console.error('[admin/scrape] Fatal:', err.message));
});

module.exports = router;
