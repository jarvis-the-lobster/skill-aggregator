const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const pushService = require('../services/pushService');

// GET /api/push/vapid-key — return the VAPID public key (public)
router.get('/vapid-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — save push subscription for authenticated user
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await pushService.saveSubscription(req.user.id, { endpoint, keys });
    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// DELETE /api/push/unsubscribe — remove push subscription
router.delete('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await pushService.removeSubscription(req.user.id, endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err.message);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

module.exports = router;
