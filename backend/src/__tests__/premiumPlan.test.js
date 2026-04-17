const { createTestDb, clearTables } = require('./helpers/testDb');

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

process.env.CRON_SECRET = 'test-secret';

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

async function createUser({ email = 'test@example.com', status = 'free', subscriptionId = null } = {}) {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 1);
  await db.insert(
    `INSERT INTO users (email, password_hash, subscription_status, subscription_id)
     VALUES (?, ?, ?, ?)`,
    [email, hash, status, subscriptionId]
  );
  return db.getUserByEmail(email);
}

async function loginAs(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  return res.body.token;
}

async function setupSkillWithPlan(skillId = 'javascript') {
  await db.insert(
    `INSERT INTO skills (id, name, category, difficulty, status) VALUES (?, ?, ?, ?, ?)`,
    [skillId, 'JavaScript', 'programming', 'beginner', 'ready']
  );
  const days = [];
  for (let i = 1; i <= 30; i++) {
    const isReview = [7, 14, 21, 28].includes(i);
    days.push({
      day_number: i,
      content_id: isReview ? null : `content-${skillId}-${i}`,
      content_type: isReview ? 'review' : 'video',
      reason: `Day ${i} content`,
    });
    if (!isReview) {
      await db.insert(
        `INSERT OR IGNORE INTO content (id, skill_id, type, title, url, source, duration, views)
         VALUES (?, ?, 'video', ?, ?, 'YouTube', '10:00', 1000)`,
        [`content-${skillId}-${i}`, skillId, `Lesson ${i}`, `https://example.com/${i}`]
      );
    }
  }
  await db.saveLearningPlan(skillId, days);
}

// ─── Premium job gating ───────────────────────────────────────────────────

describe('Premium plan job creation gating', () => {
  test('free user completing day 7 does NOT create a premium_plan_generation job', async () => {
    const user = await createUser({ email: 'free@example.com', status: 'free' });
    const token = await loginAs('free@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 7 });

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(0);
  });

  test('premium user completing day 7 DOES create a premium_plan_generation job', async () => {
    const user = await createUser({ email: 'premium@example.com', status: 'active' });
    const token = await loginAs('premium@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const res = await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 7 });

    expect(res.body.premiumGenerating).toBe(true);
    expect(res.body.message).toContain('Day 7');

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].day_number).toBe(7);
  });

  test('premium user completing day 14 creates a job', async () => {
    const user = await createUser({ email: 'premium14@example.com', status: 'active' });
    const token = await loginAs('premium14@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const res = await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 14 });

    expect(res.body.premiumGenerating).toBe(true);
    expect(res.body.message).toContain('Day 14');

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].day_number).toBe(14);
  });

  test('premium user completing day 21 creates a job', async () => {
    const user = await createUser({ email: 'premium21@example.com', status: 'active' });
    const token = await loginAs('premium21@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const res = await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 21 });

    expect(res.body.premiumGenerating).toBe(true);
    expect(res.body.message).toContain('Day 21');

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].day_number).toBe(21);
  });

  test('premium user completing day 28 creates a job', async () => {
    const user = await createUser({ email: 'premium28@example.com', status: 'active' });
    const token = await loginAs('premium28@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const res = await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 28 });

    expect(res.body.premiumGenerating).toBe(true);
    expect(res.body.message).toContain('Day 28');

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].day_number).toBe(28);
  });

  test('premium user completing a non-review day does NOT create a job', async () => {
    const user = await createUser({ email: 'premium-nonreview@example.com', status: 'active' });
    const token = await loginAs('premium-nonreview@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    await request(app)
      .post('/api/learning-plans/javascript/complete-day')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 3 });

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ?`,
      [user.id]
    );
    expect(jobs.length).toBe(0);
  });
});

// ─── mergePremiumPlan ─────────────────────────────────────────────────────

describe('admin premium plan save validation', () => {
  test('rejects premium plan days outside the trigger range', async () => {
    const user = await createUser({ email: 'admin-range@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');
    const job = await db.createPlanJob({
      user_id: user.id,
      skill_id: 'javascript',
      job_type: 'premium_plan_generation',
      day_number: 7,
      payload: { triggerDay: 7 },
    });

    const res = await request(app)
      .post(`/api/admin/premium-plans/save/${user.id}/javascript`)
      .set('Authorization', 'Bearer test-secret')
      .send({
        jobId: job.id,
        days: [{ day_number: 15, content_id: 'content-javascript-8', content_type: 'video', reason: 'bad range' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 8 and 14/i);
  });

  test('rejects premium plan days with content outside the skill content pool', async () => {
    const user = await createUser({ email: 'admin-content@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');
    const job = await db.createPlanJob({
      user_id: user.id,
      skill_id: 'javascript',
      job_type: 'premium_plan_generation',
      day_number: 7,
      payload: { triggerDay: 7 },
    });

    const res = await request(app)
      .post(`/api/admin/premium-plans/save/${user.id}/javascript`)
      .set('Authorization', 'Bearer test-secret')
      .send({
        jobId: job.id,
        days: [{ day_number: 8, content_id: 'other-skill-content', content_type: 'video', reason: 'wrong content' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to skill javascript/i);
  });
});

describe('mergePremiumPlan', () => {
  test('copies pending_merge rows to user_learning_plans and marks them merged', async () => {
    const user = await createUser({ email: 'merge@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');

    const premiumDays = [
      { day_number: 8, content_id: 'content-javascript-8', content_type: 'video', reason: 'premium pick' },
      { day_number: 9, content_id: 'content-javascript-9', content_type: 'video', reason: 'premium pick' },
    ];
    await db.savePremiumPlanDays(user.id, 'javascript', premiumDays);

    const pendingBefore = await db.getPremiumPlanPending(user.id, 'javascript');
    expect(pendingBefore.length).toBe(2);

    await db.mergePremiumPlan(user.id, 'javascript');

    const pendingAfter = await db.getPremiumPlanPending(user.id, 'javascript');
    expect(pendingAfter.length).toBe(0);

    const userPlan = await db.getUserLearningPlan(user.id, 'javascript');
    const day8 = userPlan.find(d => d.day_number === 8);
    expect(day8).toBeTruthy();
    expect(day8.reason).toBe('premium pick');
  });

  test('does not overwrite already-completed days during merge', async () => {
    const user = await createUser({ email: 'merge-skip@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');

    // Copy shared plan to user so day 8 exists
    const sharedPlan = await db.getLearningPlan('javascript');
    await db.saveUserLearningPlan(user.id, 'javascript', sharedPlan);

    // Get original content_id for day 8
    const planBefore = await db.getUserLearningPlan(user.id, 'javascript');
    const originalDay8 = planBefore.find(d => d.day_number === 8);
    const originalContentId = originalDay8.content_id;

    // Mark day 8 as completed
    await db.completePlanDay(user.id, 'javascript', 8);

    // Save premium days that include day 8 with different content
    await db.savePremiumPlanDays(user.id, 'javascript', [
      { day_number: 8, content_id: 'premium-replacement-8', content_type: 'video', reason: 'premium pick' },
      { day_number: 9, content_id: 'premium-replacement-9', content_type: 'video', reason: 'premium pick' },
    ]);

    await db.mergePremiumPlan(user.id, 'javascript');

    const planAfter = await db.getUserLearningPlan(user.id, 'javascript');
    const day8After = planAfter.find(d => d.day_number === 8);
    const day9After = planAfter.find(d => d.day_number === 9);

    // Day 8 should retain original content (was completed)
    expect(day8After.content_id).toBe(originalContentId);
    // Day 9 should be updated (was not completed)
    expect(day9After.content_id).toBe('premium-replacement-9');
    expect(day9After.reason).toBe('premium pick');
  });
});

// ─── deletePendingPremiumPlan ─────────────────────────────────────────────

describe('deletePendingPremiumPlan', () => {
  test('removes only pending_merge rows, not merged ones', async () => {
    const user = await createUser({ email: 'delete@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');

    const mergedDays = [{ day_number: 8, content_id: 'c1', content_type: 'video', reason: 'merged' }];
    await db.savePremiumPlanDays(user.id, 'javascript', mergedDays);
    await db.insert(
      `UPDATE premium_plan_days SET status = 'merged' WHERE user_id = ? AND skill_id = ? AND day_number = 8`,
      [user.id, 'javascript']
    );

    const pendingDays = [{ day_number: 15, content_id: 'c2', content_type: 'video', reason: 'pending' }];
    await db.savePremiumPlanDays(user.id, 'javascript', pendingDays);

    await db.deletePendingPremiumPlan(user.id, 'javascript');

    const allRows = await db.query(
      `SELECT * FROM premium_plan_days WHERE user_id = ? AND skill_id = ?`,
      [user.id, 'javascript']
    );
    expect(allRows.length).toBe(1);
    expect(allRows[0].status).toBe('merged');
    expect(allRows[0].day_number).toBe(8);
  });
});

// ─── Downgrade handler ────────────────────────────────────────────────────

describe('Downgrade handler', () => {
  test('removes pending premium rows and restores shared plan days on subscription deleted', async () => {
    const stripeService = require('../services/stripeService');

    const user = await createUser({ email: 'downgrade@example.com', status: 'active', subscriptionId: 'sub_down' });
    await db.insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', ['cus_down', user.id]);
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    // Copy shared plan to user
    const sharedPlan = await db.getLearningPlan('javascript');
    await db.saveUserLearningPlan(user.id, 'javascript', sharedPlan);

    // Mark some days complete
    await db.completePlanDay(user.id, 'javascript', 1);
    await db.completePlanDay(user.id, 'javascript', 2);

    // Add pending premium days
    await db.savePremiumPlanDays(user.id, 'javascript', [
      { day_number: 8, content_id: 'premium-8', content_type: 'video', reason: 'premium' },
    ]);

    mockDb.getUserByStripeCustomerId = jest.fn().mockResolvedValue({
      ...user, stripe_customer_id: 'cus_down',
    });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_down',
          customer: 'cus_down',
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

    // Pending premium rows should be gone
    const pending = await db.getPremiumPlanPending(user.id, 'javascript');
    expect(pending.length).toBe(0);

    // Notification should exist
    const notifications = await db.getNotifications(user.id);
    const downgradeNotif = notifications.find(n => n.type === 'subscription_downgraded');
    expect(downgradeNotif).toBeTruthy();
    expect(downgradeNotif.title).toBe('Your Premium plan has ended');

    mockDb.getUserByStripeCustomerId = db.getUserByStripeCustomerId.bind(db);
  });

  test('restores shared plan content for incomplete days after downgrade', async () => {
    const stripeService = require('../services/stripeService');

    const user = await createUser({ email: 'downgrade-restore@example.com', status: 'active', subscriptionId: 'sub_restore' });
    await db.insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', ['cus_restore', user.id]);
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const sharedPlan = await db.getLearningPlan('javascript');
    await db.saveUserLearningPlan(user.id, 'javascript', sharedPlan);

    const sharedDay8 = sharedPlan.find(d => d.day_number === 8);

    await db.completePlanDay(user.id, 'javascript', 1);
    await db.completePlanDay(user.id, 'javascript', 2);

    const modifiedPlan = sharedPlan.map(d =>
      d.day_number === 8 ? { ...d, content_id: 'premium-day-8-content' } : d
    );
    await db.saveUserLearningPlan(user.id, 'javascript', modifiedPlan);

    mockDb.getUserByStripeCustomerId = jest.fn().mockResolvedValue({
      ...user, stripe_customer_id: 'cus_restore',
    });

    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_restore',
          customer: 'cus_restore',
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

    const userPlan = await db.getUserLearningPlan(user.id, 'javascript');
    const day8After = userPlan.find(d => d.day_number === 8);
    expect(day8After.content_id).toBe(sharedDay8.content_id);

    const progress = await db.query(
      `SELECT completed_days FROM user_plan_progress WHERE user_id = ? AND skill_id = ?`,
      [user.id, 'javascript']
    );
    const completedDays = JSON.parse(progress[0].completed_days);
    expect(completedDays).toContain(1);
    expect(completedDays).toContain(2);

    mockDb.getUserByStripeCustomerId = db.getUserByStripeCustomerId.bind(db);
  });
});

// ─── Premium pending endpoint ─────────────────────────────────────────────

describe('GET /api/learning-plans/:skillId/premium-pending', () => {
  test('returns correct hasPending state', async () => {
    const user = await createUser({ email: 'pending@example.com', status: 'active' });
    const token = await loginAs('pending@example.com');
    await setupSkillWithPlan('javascript');

    // No pending rows
    let res = await request(app)
      .get('/api/learning-plans/javascript/premium-pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.hasPending).toBe(false);
    expect(res.body.dayCount).toBe(0);

    // Add pending rows
    await db.savePremiumPlanDays(user.id, 'javascript', [
      { day_number: 8, content_id: 'c1', content_type: 'video', reason: 'test' },
      { day_number: 9, content_id: 'c2', content_type: 'video', reason: 'test' },
    ]);

    res = await request(app)
      .get('/api/learning-plans/javascript/premium-pending')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.hasPending).toBe(true);
    expect(res.body.dayCount).toBe(2);
  });

  test('returns 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/learning-plans/javascript/premium-pending');
    expect(res.status).toBe(401);
  });
});

// ─── Merge premium endpoint ──────────────────────────────────────────────

describe('POST /api/learning-plans/:skillId/merge-premium', () => {
  test('returns merged plan', async () => {
    const user = await createUser({ email: 'mergeapi@example.com', status: 'active' });
    const token = await loginAs('mergeapi@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    // Copy shared plan to user first
    const sharedPlan = await db.getLearningPlan('javascript');
    await db.saveUserLearningPlan(user.id, 'javascript', sharedPlan);

    // Save premium days
    await db.savePremiumPlanDays(user.id, 'javascript', [
      { day_number: 8, content_id: 'content-javascript-8', content_type: 'video', reason: 'premium curated' },
    ]);

    const res = await request(app)
      .post('/api/learning-plans/javascript/merge-premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(true);
    expect(Array.isArray(res.body.plan)).toBe(true);

    const day8 = res.body.plan.find(d => d.day_number === 8);
    expect(day8).toBeTruthy();
    expect(day8.reason).toBe('premium curated');
  });

  test('returns 200 with empty plan when no pending premium rows exist', async () => {
    const user = await createUser({ email: 'merge-empty@example.com', status: 'active' });
    const token = await loginAs('merge-empty@example.com');
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    const sharedPlan = await db.getLearningPlan('javascript');
    await db.saveUserLearningPlan(user.id, 'javascript', sharedPlan);

    const res = await request(app)
      .post('/api/learning-plans/javascript/merge-premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(true);
    expect(Array.isArray(res.body.plan)).toBe(true);
  });
});

// ─── Admin context endpoint ─────────────────────────────────────────────

describe('GET /api/admin/premium-plans/jobs', () => {
  test('returns pending premium plan generation jobs with target ranges', async () => {
    const user = await createUser({ email: 'premium-jobs@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    await db.insert(
      `INSERT INTO plan_jobs (skill_id, user_id, job_type, status, day_number, payload)
       VALUES (?, ?, 'premium_plan_generation', 'pending', 7, ?)`,
      ['javascript', user.id, JSON.stringify({ triggerDay: 7 })]
    );

    const res = await request(app)
      .get('/api/admin/premium-plans/jobs?limit=10')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.jobs[0]).toMatchObject({
      skillId: 'javascript',
      userId: user.id,
      triggerDay: 7,
      targetDays: { start: 8, end: 14 },
      status: 'pending',
    });
  });

  test('returns 401 without CRON_SECRET', async () => {
    const res = await request(app)
      .get('/api/admin/premium-plans/jobs');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/premium-plans/context/:userId/:skillId', () => {
  test('returns structured context for LLM curation', async () => {
    const user = await createUser({ email: 'ctx@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');

    await db.insert(
      `INSERT INTO plan_jobs (skill_id, user_id, job_type, status, day_number, payload)
       VALUES (?, ?, 'premium_plan_generation', 'pending', 7, ?)`,
      ['javascript', user.id, JSON.stringify({ triggerDay: 7 })]
    );

    const res = await request(app)
      .get(`/api/admin/premium-plans/context/${user.id}/javascript`)
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.jobId).not.toBeNull();
    expect(res.body.triggerDay).toBe(7);
    expect(res.body.targetDays).toEqual({ start: 8, end: 14 });
    expect(Array.isArray(res.body.availableContent)).toBe(true);
    expect(Array.isArray(res.body.currentPlan)).toBe(true);
    expect(Array.isArray(res.body.reviewSubmissions)).toBe(true);
    expect(typeof res.body.instructions).toBe('string');
  });

  test('returns 401 without CRON_SECRET', async () => {
    const res = await request(app)
      .get('/api/admin/premium-plans/context/1/javascript');

    expect(res.status).toBe(401);
  });
});

// ─── Admin save endpoint ────────────────────────────────────────────────

describe('POST /api/admin/premium-plans/save/:userId/:skillId', () => {
  test('saves premium days, fires notification, marks job complete', async () => {
    const user = await createUser({ email: 'save@example.com', status: 'active' });
    await setupSkillWithPlan('javascript');
    await db.enrollPlan(user.id, 'javascript');
    await db.enrollCourse(user.id, 'javascript');
    await db.completePlanDay(user.id, 'javascript', 1);

    await db.insert(
      `INSERT INTO plan_jobs (skill_id, user_id, job_type, status, day_number, payload)
       VALUES (?, ?, 'premium_plan_generation', 'pending', 7, ?)`,
      ['javascript', user.id, JSON.stringify({ triggerDay: 7 })]
    );

    const jobRows = await db.query(
      `SELECT id FROM plan_jobs WHERE user_id = ? AND job_type = 'premium_plan_generation'`,
      [user.id]
    );
    const jobId = jobRows[0].id;

    const res = await request(app)
      .post(`/api/admin/premium-plans/save/${user.id}/javascript`)
      .set('Authorization', 'Bearer test-secret')
      .send({
        jobId,
        days: [
          { day_number: 8, content_id: 'content-javascript-8', content_type: 'video', reason: 'curated by agent' },
          { day_number: 9, content_id: 'content-javascript-9', content_type: 'video', reason: 'curated by agent' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);

    const pending = await db.getPremiumPlanPending(user.id, 'javascript');
    expect(pending.length).toBe(2);

    const notifications = await db.getNotifications(user.id);
    const premiumNotif = notifications.find(n => n.type === 'premium_plan_ready');
    expect(premiumNotif).toBeTruthy();
    const premiumNotifData = JSON.parse(premiumNotif.data);
    expect(premiumNotifData).toMatchObject({
      skillId: 'javascript',
      startDay: 8,
      endDay: 9,
      path: '/skills/javascript/plan',
      url: 'https://learnstack.dev/skills/javascript/plan',
    });

    const job = await db.query(`SELECT * FROM plan_jobs WHERE id = ?`, [jobId]);
    expect(job[0].status).toBe('completed');
  });

  test('returns 400 if days array is empty', async () => {
    const user = await createUser({ email: 'save-empty@example.com', status: 'active' });

    const res = await request(app)
      .post(`/api/admin/premium-plans/save/${user.id}/javascript`)
      .set('Authorization', 'Bearer test-secret')
      .send({ days: [] });

    expect(res.status).toBe(400);
  });
});
