const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
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

// POST /api/admin/scrape/nightly — trigger nightly scrape (Bearer CRON_SECRET)
router.post('/scrape/nightly', (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const scriptPath = path.join(__dirname, '../scripts/nightly-scrape.js');
  const child = spawn(process.execPath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  res.json({ ok: true, message: 'Nightly scrape started' });
});

module.exports = router;
