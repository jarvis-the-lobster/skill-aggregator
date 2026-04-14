const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../models/database');

const VALID_USER_TYPES = ['student', 'self-learner', 'career-switcher', 'professional', 'freelancer-creator'];
const VALID_GOALS = ['new-skill-for-work', 'school-coursework', 'interviews-certs', 'career-switch', 'personal-interest', 'side-project'];
const VALID_DAILY_TIMES = ['10-min', '20-min', '30-plus-min'];
const VALID_ATTRIBUTION_SOURCES = ['reddit', 'google-search', 'friend-referral', 'tiktok', 'instagram', 'other'];

// POST /api/onboarding — save onboarding answers
router.post('/', requireAuth, async (req, res) => {
  try {
    const { userType, goal, dailyTime, attributionSource = null } = req.body;

    if (!userType || !goal || !dailyTime) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (
      !VALID_USER_TYPES.includes(userType)
      || !VALID_GOALS.includes(goal)
      || !VALID_DAILY_TIMES.includes(dailyTime)
    ) {
      return res.status(400).json({ error: 'Invalid onboarding values' });
    }

    if (attributionSource && !VALID_ATTRIBUTION_SOURCES.includes(attributionSource)) {
      return res.status(400).json({ error: 'Invalid attribution source' });
    }

    await db.insert(
      `INSERT INTO user_onboarding (user_id, user_type, goal, daily_time, attribution_source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         user_type = ?,
         goal = ?,
         daily_time = ?,
         attribution_source = COALESCE(excluded.attribution_source, user_onboarding.attribution_source),
         completed_at = CURRENT_TIMESTAMP`,
      [
        req.user.id,
        userType,
        goal,
        dailyTime,
        attributionSource,
        userType,
        goal,
        dailyTime,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Onboarding save error:', err);
    res.status(500).json({ error: 'Failed to save onboarding data' });
  }
});

// GET /api/onboarding — check if current user completed onboarding
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT user_type, goal, daily_time, attribution_source, created_at, completed_at FROM user_onboarding WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length > 0) {
      res.json({ completed: true, data: rows[0] });
    } else {
      res.json({ completed: false, data: null });
    }
  } catch (err) {
    console.error('Onboarding check error:', err);
    res.status(500).json({ error: 'Failed to check onboarding status' });
  }
});

module.exports = router;
