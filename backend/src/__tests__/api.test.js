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

// Helper: register a user and return their token
async function getAuthToken() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'api@example.com', password: 'password123' });
  return res.body.token;
}

describe('GET /api/health', () => {
  test('returns 200 with healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /api/skills', () => {
  test('returns skills array', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );

    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.skills)).toBe(true);
    expect(res.body.skills.length).toBe(1);
    expect(res.body.skills[0].id).toBe('python');
  });
});

describe('GET /api/skills/:id', () => {
  test('returns skill content for existing ready skill — isEmpty regression guard', async () => {
    // This test guards against the isEmpty bug that caused 28 hours of downtime.
    // A valid ready skill must return status 'ready' without throwing.
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source, duration, views) VALUES ('v1', 'python', 'video', 'Learn Python', 'https://yt.com/v1', 'youtube', '10:00', 5000)"
    );

    const res = await request(app).get('/api/skills/python');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.content).toBeDefined();
    expect(res.body.content.videos.length).toBe(1);
  });

  test('returns pending for non-existent skill without crashing', async () => {
    const res = await request(app).get('/api/skills/nonexistent-skill');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.skill).toBeDefined();
  });
});

describe('GET /api/skills/search', () => {
  test('search?q=python returns results', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );

    const res = await request(app).get('/api/skills/search?q=python');
    expect(res.status).toBe(200);
    expect(res.body.skill).toBeDefined();
    expect(res.body.skill.id).toBe('python');
  });
});

describe('POST /api/admin/skills/:id/category', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('updates category when authorized with CRON_SECRET', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('reddit-marketing', 'Reddit Marketing', 'ready')"
    );

    const res = await request(app)
      .post('/api/admin/skills/reddit-marketing/category')
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ category: 'marketing' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.skillId).toBe('reddit-marketing');
    expect(res.body.previousCategory).toBeNull();
    expect(res.body.category).toBe('marketing');

    const updated = await db.getSkillById('reddit-marketing');
    expect(updated.category).toBe('marketing');
  });

  test('rejects unauthorized requests', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('reddit-marketing', 'Reddit Marketing', 'ready')"
    );

    const res = await request(app)
      .post('/api/admin/skills/reddit-marketing/category')
      .send({ category: 'marketing' });

    expect(res.status).toBe(401);
  });

  test('rejects invalid category values', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('reddit-marketing', 'Reddit Marketing', 'ready')"
    );

    const res = await request(app)
      .post('/api/admin/skills/reddit-marketing/category')
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ category: 'Marketing Team' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lowercase letters, numbers, and hyphens/i);
  });
});

describe('POST /api/courses/enroll/:skillId', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/api/courses/enroll/python');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/streaks', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/streaks');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/push/vapid-key', () => {
  test('returns public key when configured', async () => {
    const original = process.env.VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = 'test-vapid-key-123';

    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('test-vapid-key-123');

    // Restore
    if (original === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = original;
  });

  test('returns 503 when not configured', async () => {
    const original = process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;

    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(503);

    if (original !== undefined) process.env.VAPID_PUBLIC_KEY = original;
  });
});
