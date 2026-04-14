const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);
jest.mock('../services/analyticsService', () => ({
  trackUserRegistered: jest.fn(),
  trackUserLoggedIn: jest.fn(),
  trackSkillSearched: jest.fn(),
  trackSkillContentServed: jest.fn(),
}));
jest.mock('../services/pushService', () => ({
  saveSubscription: jest.fn(),
  removeSubscription: jest.fn(),
  sendPushToUser: jest.fn(),
}));

const request = require('supertest');
let app, token;

beforeAll(async () => {
  const testDb = await createTestDb();
  Object.assign(mockDb, testDb);
  app = require('../app');

  // Create a test user
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'onboard@test.com', password: 'testpass123', name: 'Test' });
  token = res.body.token;
});

beforeEach(async () => {
  // Clear onboarding table between tests but keep user
  await mockDb.insert('DELETE FROM user_onboarding', []);
});

describe('Onboarding API', () => {
  test('GET /api/onboarding returns not completed for new user', async () => {
    const res = await request(app)
      .get('/api/onboarding')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.data).toBeNull();
  });

  test('POST /api/onboarding requires all fields', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student' });
    expect(res.status).toBe(400);
  });

  test('POST /api/onboarding rejects invalid values', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'hacker', goal: 'steal-data', dailyTime: '999-hours' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid onboarding values');
  });

  test('POST /api/onboarding saves valid answers', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/onboarding saves valid answers with attribution', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min', attributionSource: 'reddit' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/onboarding accepts instagram as attribution source', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min', attributionSource: 'instagram' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/onboarding rejects twitter-x (removed attribution source)', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min', attributionSource: 'twitter-x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid attribution source');
  });

  test('POST /api/onboarding rejects invalid attribution source', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min', attributionSource: 'myspace' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid attribution source');
  });

  test('POST /api/onboarding saves without attribution (optional field)', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'professional', goal: 'personal-interest', dailyTime: '10-min' });
    expect(res.status).toBe(200);

    const get = await request(app)
      .get('/api/onboarding')
      .set('Authorization', `Bearer ${token}`);
    expect(get.body.data.attribution_source).toBeNull();
  });

  test('GET /api/onboarding returns completed after saving', async () => {
    // Save first
    await request(app)
      .post('/api/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min', attributionSource: 'tiktok' });

    const res = await request(app)
      .get('/api/onboarding')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.data.user_type).toBe('student');
    expect(res.body.data.goal).toBe('career-switch');
    expect(res.body.data.daily_time).toBe('20-min');
    expect(res.body.data.attribution_source).toBe('tiktok');
  });

  test('POST /api/onboarding requires auth', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min' });
    expect(res.status).toBe(401);
  });
});
