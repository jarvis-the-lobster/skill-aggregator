const express = require('express');
const router = express.Router();
const streakService = require('../services/streakService');
const { requireAuth } = require('../middleware/auth');

// GET /api/streaks — get current user's streak data
router.get('/', requireAuth, async (req, res) => {
  try {
    const streak = await streakService.getStreak(req.user.id);
    res.json(streak);
  } catch (err) {
    console.error('Get streak error:', err);
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

// POST /api/streaks/activity — record activity for today
router.post('/activity', requireAuth, async (req, res) => {
  try {
    const streak = await streakService.recordActivity(req.user.id);
    res.json(streak);
  } catch (err) {
    console.error('Record activity error:', err);
    res.status(500).json({ error: 'Failed to record activity' });
  }
});

module.exports = router;
