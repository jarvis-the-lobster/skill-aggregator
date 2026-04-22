const { createTestDb, clearTables } = require('./helpers/testDb');

// Mock Stripe service so we don't need real API keys in tests
jest.mock('../services/stripeService', () => ({
  isConfigured: jest.fn(() => true),
  constructWebhookEvent: jest.fn(),
  retrieveSubscription: jest.fn(),
  retrieveCustomer: jest.fn(),
  getOrCreateCustomer: jest.fn(),
  createCheckoutSession: jest.fn(),
  cancelSubscriptionAtPeriodEnd: jest.fn(),
}));

jest.mock('../services/analyticsService', () => ({
  trackUserRegistered: jest.fn(),
  trackUserLoggedIn: jest.fn(),
}));

jest.mock('../services/pushService', () => ({
  saveSubscription: jest.fn(),
  removeSubscription: jest.fn(),
  sendPushToUser: jest.fn(),
  sendStreakReminder: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));

jest.mock('../services/scraperService', () => ({
  scrapeSkill: jest.fn().mockResolvedValue({ videos: [], articles: [] }),
}));

const mockDb = {};
jest.mock('../models/database', () => mockDb);

const stripeService = require('../services/stripeService');
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

// Helper: create a user with a given subscription state
async function createUserWithSubscription({ email = 'test@example.com', status, subscriptionId = null, endDate = null } = {}) {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 1);
  await db.insert(
    `INSERT INTO users (email, password_hash, subscription_status, subscription_id, subscription_end_date)
     VALUES (?, ?, ?, ?, ?)`,
    [email, hash, status, subscriptionId, endDate]
  );
  return db.getUserByEmail(email);
}

// Helper: get a JWT for a user
async function loginAs(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  return res.body.token;
}

// ─── Webhook handler ───────────────────────────────────────────────────────

describe('POST /api/billing/webhook', () => {
  test('checkout.session.completed: trialing subscription → sets status to active', async () => {
    const user = await createUserWithSubscription({ email: 'checkout@example.com', status: 'free' });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: String(user.id),
          customer: 'cus_test123',
          subscription: 'sub_test123',
        },
      },
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_test123',
      status: 'trialing',
      current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400,
      trial_end: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    const res = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);

    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('active');
    expect(updated.subscription_id).toBe('sub_test123');
    expect(updated.stripe_customer_id).toBe('cus_test123');
  });

  test('checkout.session.completed: active subscription → sets status to active', async () => {
    const user = await createUserWithSubscription({ email: 'active@example.com', status: 'free' });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: String(user.id),
          customer: 'cus_active',
          subscription: 'sub_active',
        },
      },
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_active',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    });

    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send('{}');

    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('active');
  });

  test('customer.subscription.deleted: sets status to cancelled', async () => {
    const user = await createUserWithSubscription({
      email: 'deleted@example.com',
      status: 'active',
      subscriptionId: 'sub_del',
    });
    await db.insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', ['cus_del', user.id]);

    mockDb.getUserByStripeCustomerId = jest.fn().mockResolvedValue({ ...user, stripe_customer_id: 'cus_del' });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_del',
          customer: 'cus_del',
          status: 'canceled',
          current_period_end: Math.floor(Date.now() / 1000),
        },
      },
    });

    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send('{}');

    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('cancelled');

    // restore
    mockDb.getUserByStripeCustomerId = db.getUserByStripeCustomerId.bind(db);
  });

  test('invoice.payment_failed: sets status to past_due', async () => {
    const user = await createUserWithSubscription({
      email: 'pastdue@example.com',
      status: 'active',
      subscriptionId: 'sub_pd',
    });
    await db.insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', ['cus_pd', user.id]);

    mockDb.getUserByStripeCustomerId = jest.fn().mockResolvedValue({ ...user, stripe_customer_id: 'cus_pd' });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: { customer: 'cus_pd' },
      },
    });

    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send('{}');

    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('past_due');

    mockDb.getUserByStripeCustomerId = db.getUserByStripeCustomerId.bind(db);
  });

  test('invalid signature → 400', async () => {
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'bad_sig')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });
});

// ─── Cancel endpoint ───────────────────────────────────────────────────────

describe('POST /api/billing/cancel', () => {
  test('keeps status as active after cancel-at-period-end (not immediately cancelled)', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 7 * 86400;
    const user = await createUserWithSubscription({
      email: 'cancel@example.com',
      status: 'active',
      subscriptionId: 'sub_cancel',
    });

    stripeService.cancelSubscriptionAtPeriodEnd.mockResolvedValue({
      id: 'sub_cancel',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: periodEnd,
    });

    const token = await loginAs('cancel@example.com');
    const res = await request(app)
      .post('/api/billing/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const updated = await db.getUserById(user.id);
    // Should remain active — not immediately flipped to cancelled
    expect(updated.subscription_status).toBe('active');
    expect(updated.subscription_end_date).toBeTruthy();
  });

  test('returns 400 if user has no subscription', async () => {
    await createUserWithSubscription({ email: 'nosub@example.com', status: 'free' });
    const token = await loginAs('nosub@example.com');

    const res = await request(app)
      .post('/api/billing/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ─── Billing status endpoint ───────────────────────────────────────────────

describe('GET /api/billing/status', () => {
  test('trial user (active status) shows isPremium true', async () => {
    const futureDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'trial@example.com',
      status: 'active',
      subscriptionId: 'sub_trial',
      endDate: futureDate,
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_trial',
      status: 'trialing',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    const token = await loginAs('trial@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);
    expect(res.body.isTrialing).toBe(true);
    expect(res.body.cancelAtPeriodEnd).toBe(false);
  });

  test('post-trial user (cancelled, end date in past) shows isPremium false', async () => {
    const pastDate = new Date(Date.now() - 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'posttrial@example.com',
      status: 'cancelled',
      subscriptionId: 'sub_expired',
      endDate: pastDate,
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_expired',
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) - 86400,
    });

    const token = await loginAs('posttrial@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.isPremium).toBe(false);
  });

  test('cancelled user with future end date shows isPremium false (backend returns raw status; frontend computes access)', async () => {
    const futureDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'cancelledfuture@example.com',
      status: 'cancelled',
      subscriptionId: 'sub_cancelledfuture',
      endDate: futureDate,
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_cancelledfuture',
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    const token = await loginAs('cancelledfuture@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    // Backend isPremium is false for cancelled; frontend useSubscription adds the date check
    expect(res.body.isPremium).toBe(false);
    expect(res.body.isTrialing).toBe(false);
  });

  test('cancelled trial user exposes cancel-at-period-end and trialing flags for clearer account messaging', async () => {
    const futureDate = new Date(Date.now() + 5 * 86400 * 1000).toISOString();
    await createUserWithSubscription({
      email: 'trialcancelled@example.com',
      status: 'active',
      subscriptionId: 'sub_trial_cancelled',
      endDate: futureDate,
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_trial_cancelled',
      status: 'trialing',
      cancel_at_period_end: true,
      current_period_end: Math.floor(Date.now() / 1000) + 5 * 86400,
    });

    const token = await loginAs('trialcancelled@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);
    expect(res.body.isTrialing).toBe(true);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
  });

  test('drift: DB says cancelled but Stripe says active → reconciles to active and repairs DB', async () => {
    const futureEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    const user = await createUserWithSubscription({
      email: 'drift-active@example.com',
      status: 'cancelled',
      subscriptionId: 'sub_drift_active',
      endDate: new Date(Date.now() - 86400 * 1000).toISOString(), // stale past date in DB
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_drift_active',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: futureEnd,
    });

    const token = await loginAs('drift-active@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);

    // Verify DB was repaired
    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('active');
    expect(updated.subscription_end_date).toBe(new Date(futureEnd * 1000).toISOString());
  });

  test('drift: DB says active but Stripe says canceled → reconciles to cancelled and repairs DB', async () => {
    const pastEnd = Math.floor(Date.now() / 1000) - 86400;
    const user = await createUserWithSubscription({
      email: 'drift-cancelled@example.com',
      status: 'active',
      subscriptionId: 'sub_drift_cancelled',
      endDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(), // stale future date in DB
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_drift_cancelled',
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: pastEnd,
    });

    const token = await loginAs('drift-cancelled@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.isPremium).toBe(false);

    // Verify DB was repaired
    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('cancelled');
  });

  test('drift: DB says free but Stripe says trialing → reconciles to active and repairs DB', async () => {
    const futureEnd = Math.floor(Date.now() / 1000) + 7 * 86400;
    const user = await createUserWithSubscription({
      email: 'drift-trialing@example.com',
      status: 'free',
      subscriptionId: 'sub_drift_trialing',
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_drift_trialing',
      status: 'trialing',
      cancel_at_period_end: false,
      current_period_end: futureEnd,
    });

    const token = await loginAs('drift-trialing@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);
    expect(res.body.isTrialing).toBe(true);

    // Verify DB was repaired
    const updated = await db.getUserById(user.id);
    expect(updated.subscription_status).toBe('active');
  });

  test('Stripe lookup failure falls back to DB state gracefully', async () => {
    await createUserWithSubscription({
      email: 'stripe-fail@example.com',
      status: 'active',
      subscriptionId: 'sub_fail',
      endDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    });

    stripeService.retrieveSubscription.mockRejectedValue(new Error('Stripe is down'));

    const token = await loginAs('stripe-fail@example.com');
    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Falls back to DB state
    expect(res.body.status).toBe('active');
    expect(res.body.isPremium).toBe(true);
  });
});

// ─── Auth /me reconciliation ──────────────────────────────────────────────

describe('GET /api/auth/me (subscription reconciliation)', () => {
  test('drift: DB says cancelled but Stripe says active → /me returns reconciled status', async () => {
    const futureEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    await createUserWithSubscription({
      email: 'me-drift@example.com',
      status: 'cancelled',
      subscriptionId: 'sub_me_drift',
      endDate: new Date(Date.now() - 86400 * 1000).toISOString(),
    });

    stripeService.retrieveSubscription.mockResolvedValue({
      id: 'sub_me_drift',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: futureEnd,
    });

    const token = await loginAs('me-drift@example.com');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.subscription_status).toBe('active');
    expect(res.body.user.subscription_end_date).toBe(new Date(futureEnd * 1000).toISOString());
  });

  test('free user with no subscription_id skips Stripe lookup', async () => {
    await createUserWithSubscription({
      email: 'free-user@example.com',
      status: 'free',
    });

    const token = await loginAs('free-user@example.com');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.subscription_status).toBe('free');
    // Should not have called Stripe
    expect(stripeService.retrieveSubscription).not.toHaveBeenCalled();
  });
});
