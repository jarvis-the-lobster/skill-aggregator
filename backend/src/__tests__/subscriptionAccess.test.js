const { hasPremiumAccess } = require('../utils/subscriptionAccess');

describe('hasPremiumAccess', () => {
  test('active → premium', () => {
    expect(hasPremiumAccess('active')).toBe(true);
  });

  test('free → not premium', () => {
    expect(hasPremiumAccess('free')).toBe(false);
  });

  test('cancelled → not premium (frontend handles date check)', () => {
    expect(hasPremiumAccess('cancelled')).toBe(false);
  });

  test('past_due → not premium', () => {
    expect(hasPremiumAccess('past_due')).toBe(false);
  });

  test('null/undefined → not premium', () => {
    expect(hasPremiumAccess(null)).toBe(false);
    expect(hasPremiumAccess(undefined)).toBe(false);
  });

  test('trialing should not appear in DB (normalized to active by webhook) → not premium', () => {
    // Stripe's 'trialing' is mapped to 'active' by mapSubscriptionStatus() before DB write.
    // If it somehow appears in the DB, treat it as not premium rather than silently granting access.
    expect(hasPremiumAccess('trialing')).toBe(false);
  });
});

// ─── Enrollment gating integration ────────────────────────────────────────

const { createTestDb, clearTables } = require('./helpers/testDb');

jest.mock('../services/analyticsService', () => ({
  trackUserRegistered: jest.fn(),
  trackUserLoggedIn: jest.fn(),
  trackSkillSearched: jest.fn(),
  trackSkillContentServed: jest.fn(),
}));

jest.mock('../services/scraperService', () => ({
  scrapeSkill: jest.fn().mockResolvedValue({ videos: [], articles: [] }),
  scrapeDevTo: jest.fn().mockResolvedValue([]),
  scrapeMediumRSS: jest.fn().mockResolvedValue([]),
  scrapeFreeCodeCamp: jest.fn().mockResolvedValue([]),
  scrapeArticles: jest.requireActual('../services/scraperService').scrapeArticles,
}));

jest.mock('../services/pushService', () => ({
  saveSubscription: jest.fn(),
  removeSubscription: jest.fn(),
  sendPushToUser: jest.fn(),
  sendStreakReminder: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));

jest.mock('../services/learningPlanService', () => ({
  copyPlanForUser: jest.fn().mockResolvedValue([]),
  getPlan: jest.fn().mockResolvedValue([]),
  getPlanWithReadiness: jest.fn().mockResolvedValue({ plan: [], planReady: true, reviewContent: {} }),
  getUserPlanWithRefresh: jest.fn().mockResolvedValue({ plan: [], refreshAvailable: false, planReady: true, reviewContent: {} }),
}));

const mockDb = {};
jest.mock('../models/database', () => mockDb);

const request = require('supertest');
const app = require('../app');

let db;

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  jest.clearAllMocks();
});

afterAll(async () => {
  await db.close();
});

async function createUserWithSubscription({ email, status, endDate = null }) {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 1);
  await db.insert(
    `INSERT INTO users (email, password_hash, subscription_status, subscription_end_date)
     VALUES (?, ?, ?, ?)`,
    [email, hash, status, endDate]
  );
  return db.getUserByEmail(email);
}

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

async function createSkill(id = 'python') {
  await db.insert(
    `INSERT OR IGNORE INTO skills (id, name, category, status) VALUES (?, ?, 'programming', 'ready')`,
    [id, id]
  );
}

describe('Course enrollment gating by subscription status', () => {
  test('free user can enroll in first skill', async () => {
    await createSkill('javascript');
    await createUserWithSubscription({ email: 'free@example.com', status: 'free' });
    const token = await loginAs('free@example.com');

    const res = await request(app)
      .post('/api/courses/enroll/javascript')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(true);
  });

  test('free user blocked from enrolling in second skill', async () => {
    await createSkill('python');
    await createSkill('javascript');
    await createUserWithSubscription({ email: 'free2@example.com', status: 'free' });
    const token = await loginAs('free2@example.com');

    // First enrollment
    await request(app)
      .post('/api/courses/enroll/python')
      .set('Authorization', `Bearer ${token}`);

    // Second enrollment should be blocked
    const res = await request(app)
      .post('/api/courses/enroll/javascript')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FREE_PLAN_LIMIT_REACHED');
  });

  test('active (trial) user can enroll in multiple skills', async () => {
    await createSkill('python');
    await createSkill('javascript');
    const futureDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'trial@example.com',
      status: 'active',
      endDate: futureDate,
    });
    const token = await loginAs('trial@example.com');

    await request(app)
      .post('/api/courses/enroll/python')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/courses/enroll/javascript')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(true);
  });

  test('post-trial (cancelled, expired) user treated as free — blocked from second skill', async () => {
    await createSkill('python');
    await createSkill('javascript');
    const pastDate = new Date(Date.now() - 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'expired@example.com',
      status: 'cancelled',
      endDate: pastDate,
    });
    const token = await loginAs('expired@example.com');

    await request(app)
      .post('/api/courses/enroll/python')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/courses/enroll/javascript')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FREE_PLAN_LIMIT_REACHED');
  });
});
