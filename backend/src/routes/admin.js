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

module.exports = router;
