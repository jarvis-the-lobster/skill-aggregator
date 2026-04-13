const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);
jest.mock('../services/analyticsService', () => ({
  trackUserRegistered: jest.fn(),
  trackUserLoggedIn: jest.fn(),
  trackSkillSearched: jest.fn(),
  trackSkillContentServed: jest.fn(),
}));
jest.mock('../services/scraperService', () => ({
  scrapeSkill: jest.fn().mockResolvedValue({ videos: [], articles: [] }),
}));
jest.mock('../services/pushService', () => ({
  saveSubscription: jest.fn(),
  removeSubscription: jest.fn(),
  sendPushToUser: jest.fn(),
}));

const request = require('supertest');
const app = require('../app');

let db;

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
});

afterAll(async () => {
  await db.close();
});

async function getAuthToken() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'notif@example.com', password: 'password123' });
  return res.body.token;
}

describe('Notification API routes', () => {
  test('GET /api/notifications returns empty list for new user', async () => {
    const token = await getAuthToken();
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.unreadCount).toBe(0);
  });

  test('GET /api/notifications requires auth', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('returns notifications after creation', async () => {
    const token = await getAuthToken();
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const userId = meRes.body.user.id;

    await db.createNotification({
      user_id: userId,
      type: 'review_result',
      title: 'Review Day 7: 3/4 correct',
      body: 'You scored 3 out of 4 on your knowledge check.',
      data: { dayNumber: 7 },
    });

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications[0].title).toBe('Review Day 7: 3/4 correct');
    expect(res.body.notifications[0].read_at).toBeNull();
  });

  test('POST /api/notifications/:id/read marks notification as read', async () => {
    const token = await getAuthToken();
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const userId = meRes.body.user.id;

    const notif = await db.createNotification({
      user_id: userId,
      type: 'review_result',
      title: 'Test',
    });

    const markRes = await request(app)
      .post(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(markRes.status).toBe(200);
    expect(markRes.body.ok).toBe(true);

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.unreadCount).toBe(0);
    expect(listRes.body.notifications[0].read_at).not.toBeNull();
  });

  test('POST /api/notifications/read-all marks all as read', async () => {
    const token = await getAuthToken();
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const userId = meRes.body.user.id;

    await db.createNotification({ user_id: userId, type: 'review_result', title: 'A' });
    await db.createNotification({ user_id: userId, type: 'review_result', title: 'B' });

    const markRes = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(markRes.status).toBe(200);

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.unreadCount).toBe(0);
    expect(listRes.body.notifications.every((n) => n.read_at !== null)).toBe(true);
  });
});

describe('Notification model methods', () => {
  async function createTestUser() {
    const result = await db.createUser({ email: `model-${Date.now()}@test.com`, password_hash: 'hash' });
    return result.id;
  }

  test('createNotification stores and returns notification', async () => {
    const userId = await createTestUser();
    const notif = await db.createNotification({
      user_id: userId,
      type: 'review_result',
      title: 'Test Title',
      body: 'Test body',
      data: { foo: 'bar' },
    });
    expect(notif.id).toBeDefined();
    expect(notif.type).toBe('review_result');
    expect(notif.data).toBe('{"foo":"bar"}');
  });

  test('getNotifications respects limit and offset', async () => {
    const userId = await createTestUser();
    for (let i = 0; i < 5; i++) {
      await db.createNotification({ user_id: userId, type: 'test', title: `N${i}` });
    }
    const page1 = await db.getNotifications(userId, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);
    const page2 = await db.getNotifications(userId, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  test('getUnreadNotificationCount counts only unread', async () => {
    const userId = await createTestUser();
    const n1 = await db.createNotification({ user_id: userId, type: 'test', title: 'A' });
    await db.createNotification({ user_id: userId, type: 'test', title: 'B' });
    await db.markNotificationRead(n1.id, userId);
    const count = await db.getUnreadNotificationCount(userId);
    expect(count).toBe(1);
  });
});
