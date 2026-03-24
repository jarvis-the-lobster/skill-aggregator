const request = require('supertest');

// Mock analytics
jest.mock('../services/analyticsService', () => ({
  trackUserRegistered: jest.fn(),
  trackUserLoggedIn: jest.fn(),
  trackSkillSearched: jest.fn(),
  trackSkillContentServed: jest.fn(),
}));

const app = require('../app');
const db = require('../models/database');

let token;

beforeAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // wait for DB init
  // Create a test user and get token
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'onboard-test@test.com', password: 'testpass123', name: 'Test' });
  token = res.body.token;
});

// DB cleanup handled by Jest --forceExit (shared DB instance)

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

  test('GET /api/onboarding returns completed after saving', async () => {
    const res = await request(app)
      .get('/api/onboarding')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.data.user_type).toBe('student');
    expect(res.body.data.goal).toBe('career-switch');
    expect(res.body.data.daily_time).toBe('20-min');
  });

  test('POST /api/onboarding requires auth', async () => {
    const res = await request(app)
      .post('/api/onboarding')
      .send({ userType: 'student', goal: 'career-switch', dailyTime: '20-min' });
    expect(res.status).toBe(401);
  });
});
