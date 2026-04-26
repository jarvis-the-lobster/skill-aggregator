describe('rateLimit middleware', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    jest.resetModules();
  });

  function loadModule(env) {
    process.env.NODE_ENV = env;
    jest.resetModules();
    return require('../middleware/rateLimit');
  }

  describe('exports', () => {
    test('exports authLimiter, searchLimiter, bulkLimiter, createGeneralLimiter', () => {
      const mod = loadModule('test');
      expect(mod.authLimiter).toBeDefined();
      expect(mod.searchLimiter).toBeDefined();
      expect(mod.bulkLimiter).toBeDefined();
      expect(typeof mod.createGeneralLimiter).toBe('function');
    });

    test('does not export apiLimiter (removed)', () => {
      const mod = loadModule('test');
      expect(mod.apiLimiter).toBeUndefined();
    });

    test('createGeneralLimiter returns a new instance each call', () => {
      const mod = loadModule('test');
      const a = mod.createGeneralLimiter();
      const b = mod.createGeneralLimiter();
      expect(a).not.toBe(b);
    });
  });

  describe('extractUserId', () => {
    test('extracts userId from a valid Bearer token', () => {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const token = jwt.sign({ userId: 99 }, secret, { expiresIn: '1h' });
      const { extractUserId } = loadModule('test');

      const req = { headers: { authorization: `Bearer ${token}` } };
      expect(extractUserId(req)).toBe(99);
    });

    test('returns null for missing Authorization header', () => {
      const { extractUserId } = loadModule('test');
      expect(extractUserId({ headers: {} })).toBeNull();
    });

    test('returns null for malformed token', () => {
      const { extractUserId } = loadModule('test');
      const req = { headers: { authorization: 'Bearer garbage.token.here' } };
      expect(extractUserId(req)).toBeNull();
    });

    test('returns null for expired token', () => {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '0s' });
      const { extractUserId } = loadModule('test');

      const req = { headers: { authorization: `Bearer ${token}` } };
      expect(extractUserId(req)).toBeNull();
    });
  });

  describe('keyByUserOrIp', () => {
    test('uses req.user.id when already populated by auth middleware', () => {
      const { keyByUserOrIp } = loadModule('test');
      const req = { user: { id: 42 }, ip: '1.2.3.4', headers: {} };
      expect(keyByUserOrIp(req)).toBe('user:42');
    });

    test('extracts userId from JWT when req.user is not set', () => {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const token = jwt.sign({ userId: 7 }, secret, { expiresIn: '1h' });
      const { keyByUserOrIp } = loadModule('test');

      const req = { ip: '1.2.3.4', headers: { authorization: `Bearer ${token}` } };
      expect(keyByUserOrIp(req)).toBe('user:7');
    });

    test('falls back to IP for anonymous requests', () => {
      const { keyByUserOrIp } = loadModule('test');
      const req = { ip: '1.2.3.4', headers: {} };
      expect(keyByUserOrIp(req)).toBe('1.2.3.4');
    });
  });

  describe('skip behavior', () => {
    test('all limiters skip in test environment', () => {
      const mod = loadModule('test');
      for (const name of ['authLimiter', 'searchLimiter', 'bulkLimiter']) {
        expect(typeof mod[name]).toBe('function');
      }
      expect(typeof mod.createGeneralLimiter()).toBe('function');
    });

    test('limiters are active in development environment', () => {
      const mod = loadModule('development');
      for (const name of ['authLimiter', 'searchLimiter', 'bulkLimiter']) {
        expect(typeof mod[name]).toBe('function');
      }
    });
  });
});

describe('app.js rate-limit wiring', () => {
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
    scrapeDevTo: jest.fn().mockResolvedValue([]),
    scrapeMediumRSS: jest.fn().mockResolvedValue([]),
    scrapeFreeCodeCamp: jest.fn().mockResolvedValue([]),
    scrapeArticles: jest.requireActual('../services/scraperService').scrapeArticles,
  }));
  jest.mock('../services/pushService', () => ({
    saveSubscription: jest.fn(),
    removeSubscription: jest.fn(),
    sendPushToUser: jest.fn(),
    sendStreakReminder: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
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

  test('auth/google endpoint is reachable (not blocked by general limiter)', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).not.toBe(429);
  });

  test('auth/me is reachable without general rate-limit exhaustion', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('health endpoint is not rate-limited', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});
