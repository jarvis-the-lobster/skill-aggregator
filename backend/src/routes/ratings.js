const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const { verifyToken } = require('../services/authService');

const VALID_RATINGS = ['thumbs_up', 'thumbs_down'];

// POST /api/ratings/:contentId — upsert or remove a rating (auth required)
router.post('/:contentId', requireAuth, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { rating } = req.body;

    if (rating !== null && rating !== undefined && !VALID_RATINGS.includes(rating)) {
      return res.status(400).json({ error: 'rating must be "thumbs_up", "thumbs_down", or null' });
    }

    await db.rateContent(req.user.id, contentId, rating ?? null);
    const counts = await db.getRatingCounts([contentId]);
    const contentCounts = counts[contentId] || { thumbs_up: 0, thumbs_down: 0 };

    res.json({ contentId, rating: rating ?? null, counts: contentCounts });
  } catch (err) {
    console.error('Rate content error:', err);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// GET /api/ratings?contentIds=id1,id2,... — aggregate counts + optional user ratings
router.get('/', async (req, res) => {
  try {
    const { contentIds: rawIds } = req.query;
    if (!rawIds) return res.json({ counts: {}, userRatings: {} });

    const contentIds = rawIds.split(',').filter(Boolean);
    if (!contentIds.length) return res.json({ counts: {}, userRatings: {} });

    const counts = await db.getRatingCounts(contentIds);

    // Optional auth — include user's own ratings if a valid token is present
    let userRatings = {};
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (token) {
      try {
        const payload = verifyToken(token);
        userRatings = await db.getUserRatings(payload.userId, contentIds);
      } catch {
        // Invalid token is fine — just skip user ratings
      }
    }

    res.json({ counts, userRatings });
  } catch (err) {
    console.error('Get ratings error:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

module.exports = router;
