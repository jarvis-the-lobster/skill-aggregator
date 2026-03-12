const express = require('express');
const router = express.Router();
const db = require('../models/database');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { email, categories } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    const result = await db.addSubscriber(email.toLowerCase().trim(), categories || []);

    // INSERT OR IGNORE: changes=0 means already subscribed — still return success
    res.json({ success: true, message: "You're on the list! We'll be in touch soon." });
  } catch (err) {
    console.error('Newsletter subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// GET /api/newsletter/subscribers/count — public, for social proof
router.get('/subscribers/count', async (req, res) => {
  try {
    const count = await db.getSubscriberCount();
    res.json({ count });
  } catch (err) {
    console.error('Subscriber count error:', err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

module.exports = router;
