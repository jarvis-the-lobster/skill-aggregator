const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    const [notifications, unreadCount] = await Promise.all([
      db.getNotifications(req.user.id, { limit, offset }),
      db.getUnreadNotificationCount(req.user.id),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    await db.markNotificationRead(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

router.post('/read-all', requireAuth, async (req, res) => {
  try {
    await db.markAllNotificationsRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

module.exports = router;
