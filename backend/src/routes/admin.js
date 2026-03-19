const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/admin/metrics — ops dashboard (no auth, internal use only)
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    res.json(metrics);
  } catch (err) {
    console.error('Admin metrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', requireAuth, async (req, res) => {
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

// POST /api/admin/cleanup-low-quality — one-time removal of junk videos from DB
router.post('/cleanup-low-quality', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // Preview what will be deleted
    const toDelete = await db.query(`
      SELECT id, title, duration FROM content
      WHERE type = 'video' AND (
        (duration IS NOT NULL
         AND duration NOT LIKE '%:%:%'
         AND CAST(SUBSTR(duration, 1, INSTR(duration, ':') - 1) AS INTEGER) < 3)
        OR LOWER(title) LIKE '%#short%'
        OR LOWER(title) LIKE '%shorts%'
        OR LOWER(title) LIKE '%meme%'
        OR LOWER(title) LIKE '%compilation%'
        OR LOWER(title) LIKE '%reaction%'
      )
    `);

    if (req.query.dry === 'true') {
      return res.json({ dryRun: true, count: toDelete.length, items: toDelete.map(v => `${v.id}: ${v.title} (${v.duration})`) });
    }

    // Also clean up any ratings/interactions for these videos
    const ids = toDelete.map(v => v.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await db.insert(`DELETE FROM user_interactions WHERE content_id IN (${placeholders})`, ids);
      await db.insert(`DELETE FROM learning_plans WHERE content_id IN (${placeholders})`, ids);
      await db.insert(`DELETE FROM content WHERE id IN (${placeholders})`, ids);
    }

    res.json({ ok: true, deleted: ids.length, items: toDelete.map(v => `${v.id}: ${v.title} (${v.duration})`) });
  } catch (err) {
    console.error('Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
