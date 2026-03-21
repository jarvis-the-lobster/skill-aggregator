const webpush = require('web-push');
const db = require('../models/database');

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@learnstack.dev';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('VAPID keys not configured — push notifications disabled');
}

async function saveSubscription(userId, subscription) {
  return db.insert(
    `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
     VALUES (?, ?, ?, ?)`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

async function removeSubscription(userId, endpoint) {
  return db.insert(
    'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
    [userId, endpoint]
  );
}

async function sendPushToUser(userId, payload) {
  const subscriptions = await db.query(
    'SELECT * FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      } catch (err) {
        // 410 Gone = subscription expired/unsubscribed — clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.insert('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { sent, failed };
}

async function sendStreakReminder(userId, currentStreak) {
  const payload = {
    title: 'Your streak is at risk!',
    body: `Complete today's lesson to keep your ${currentStreak}-day streak alive.`,
    icon: '/vite.svg',
    url: '/my-courses',
  };
  return sendPushToUser(userId, payload);
}

module.exports = { saveSubscription, removeSubscription, sendPushToUser, sendStreakReminder };
