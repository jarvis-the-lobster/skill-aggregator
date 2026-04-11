const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);

const reviewContentService = require('../services/reviewContentService');
const learningPlanService = require('../services/learningPlanService');

let db;
const SKILL_ID = 'python';

async function seedSkillWithPlan() {
  await db.insert(
    "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
    [SKILL_ID]
  );

  const content = [];
  for (let i = 1; i <= 15; i++) {
    content.push({
      id: `yt_v${i}`,
      type: 'video',
      title: `Python Video ${i}`,
      url: `https://yt.com/v${i}`,
      source: 'YouTube',
      channel: 'TestChannel',
      duration: '10:00',
      views: 10000 - i * 100,
    });
  }
  for (let i = 1; i <= 15; i++) {
    content.push({
      id: `devto_a${i}`,
      type: 'article',
      title: `Python Article ${i}`,
      url: `https://dev.to/a${i}`,
      source: 'Dev.to',
      author: 'Author',
      tags: ['python'],
      views: 5000 - i * 100,
    });
  }
  await db.saveContent(content, SKILL_ID);
  await learningPlanService.generatePlan(SKILL_ID);
}

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

describe('enqueueReviewJobs', () => {
  test('creates 4 pending jobs for review days 7, 14, 21, 28', async () => {
    await seedSkillWithPlan();
    const jobs = await db.getPendingJobs();
    expect(jobs.length).toBe(4);
    const dayNumbers = jobs.map(j => j.day_number).sort((a, b) => a - b);
    expect(dayNumbers).toEqual([7, 14, 21, 28]);
    expect(jobs.every(j => j.job_type === 'review_content')).toBe(true);
    expect(jobs.every(j => j.status === 'pending')).toBe(true);
  });

  test('supersedes old jobs when plan is regenerated', async () => {
    await seedSkillWithPlan();
    const firstJobs = await db.getPendingJobs();
    expect(firstJobs.length).toBe(4);

    await learningPlanService.generatePlan(SKILL_ID);
    const allJobs = await db.query('SELECT * FROM plan_jobs ORDER BY id');
    const superseded = allJobs.filter(j => j.error_message === 'superseded');
    const pending = allJobs.filter(j => j.status === 'pending');
    expect(superseded.length).toBe(4);
    expect(pending.length).toBe(4);
  });
});

describe('processPendingJobs', () => {
  test('generates review content for all 4 review days', async () => {
    await seedSkillWithPlan();
    const results = await reviewContentService.processPendingJobs();
    expect(results.processed).toBe(4);
    expect(results.succeeded).toBe(4);
    expect(results.failed).toBe(0);

    for (const day of [7, 14, 21, 28]) {
      const review = await db.getReviewContent(SKILL_ID, day);
      expect(review).not.toBeNull();
      expect(review.review_type).toBe('weekly_checkin');
      expect(review.title).toBeTruthy();

      const body = JSON.parse(review.body);
      expect(body.summary).toBeTruthy();
      expect(body.reflection_prompts.length).toBeGreaterThan(0);
      expect(body.content_covered).toBeDefined();
      expect(body.stats).toBeDefined();
    }
  });

  test('returns empty results when no pending jobs exist', async () => {
    const results = await reviewContentService.processPendingJobs();
    expect(results.processed).toBe(0);
    expect(results.succeeded).toBe(0);
  });
});

describe('isPlanFullyReady', () => {
  test('returns false when review jobs are pending', async () => {
    await seedSkillWithPlan();
    const ready = await reviewContentService.isPlanFullyReady(SKILL_ID);
    expect(ready).toBe(false);
  });

  test('returns true after all review jobs are processed', async () => {
    await seedSkillWithPlan();
    await reviewContentService.processPendingJobs();
    const ready = await reviewContentService.isPlanFullyReady(SKILL_ID);
    expect(ready).toBe(true);
  });

  test('returns true when no jobs exist for skill', async () => {
    const ready = await reviewContentService.isPlanFullyReady('nonexistent');
    expect(ready).toBe(true);
  });
});

describe('generateWeeklyCheckin', () => {
  test('produces correct structure for week 1', () => {
    const fakePlan = [];
    for (let d = 1; d <= 7; d++) {
      fakePlan.push({
        day_number: d,
        content_id: `vid_${d}`,
        content_type: d <= 4 ? 'video' : 'article',
        title: `Content ${d}`,
        source: 'YouTube',
        duration: '10:00',
      });
    }
    const result = reviewContentService.generateWeeklyCheckin('Python', 7, fakePlan);
    expect(result.title).toBe('Week 1 Check-in: Getting Started');
    expect(result.stats.videos).toBe(4);
    expect(result.stats.articles).toBe(3);
    expect(result.stats.total_minutes).toBe(70);
    expect(result.content_covered.length).toBe(7);
    expect(result.reflection_prompts.length).toBe(3);
  });

  test('handles days with no content gracefully', () => {
    const fakePlan = [
      { day_number: 1, content_id: 'v1', content_type: 'video', title: 'A', duration: '5:00' },
      { day_number: 2, content_id: null, content_type: null, title: null },
    ];
    const result = reviewContentService.generateWeeklyCheckin('Python', 7, fakePlan);
    expect(result.stats.days_with_content).toBe(1);
    expect(result.content_covered.length).toBe(1);
  });
});

describe('getReviewContentMap', () => {
  test('returns a map keyed by day number', async () => {
    await seedSkillWithPlan();
    await reviewContentService.processPendingJobs();
    const map = await reviewContentService.getReviewContentMap(SKILL_ID);
    expect(Object.keys(map).map(Number).sort((a, b) => a - b)).toEqual([7, 14, 21, 28]);
    expect(map[7].title).toBeTruthy();
    expect(map[7].body).toBeDefined();
    expect(map[7].body.reflection_prompts).toBeDefined();
  });
});

describe('plan readiness gates refreshAvailable', () => {
  test('refreshAvailable is false while review jobs are pending', async () => {
    await db.insert(
      "INSERT INTO users (id, email, password_hash) VALUES (1, 'test@test.com', 'hash')"
    );
    await seedSkillWithPlan();

    await db.enrollPlan(1, SKILL_ID);
    await learningPlanService.copyPlanForUser(1, SKILL_ID);

    // Regenerate shared plan so it's newer than user plan
    await learningPlanService.generatePlan(SKILL_ID);
    // Bump shared plan timestamp so it's clearly newer than the user plan copy
    await db.insert(
      "UPDATE learning_plans SET created_at = datetime('now', '+1 hour') WHERE skill_id = ?",
      [SKILL_ID]
    );

    // Jobs are pending, so refreshAvailable should be false
    const result = await learningPlanService.getUserPlanWithRefresh(1, SKILL_ID);
    expect(result.planReady).toBe(false);
    expect(result.refreshAvailable).toBe(false);

    // Process jobs
    await reviewContentService.processPendingJobs();

    // Now plan is ready and refresh should be available
    const result2 = await learningPlanService.getUserPlanWithRefresh(1, SKILL_ID);
    expect(result2.planReady).toBe(true);
    expect(result2.refreshAvailable).toBe(true);
    expect(Object.keys(result2.reviewContent).length).toBe(4);
  });
});

describe('job retry and failure handling', () => {
  test('failed job retries up to max_attempts then marks as failed', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('empty-skill', 'Empty', 'ready')"
    );

    await db.createPlanJob({
      skill_id: 'empty-skill',
      job_type: 'review_content',
      day_number: 7,
      plan_created_at: null,
    });

    // Process 3 times (max_attempts = 3) — each fails because no plan exists
    for (let i = 0; i < 3; i++) {
      await reviewContentService.processPendingJobs();
    }

    const jobs = await db.query(
      "SELECT * FROM plan_jobs WHERE skill_id = 'empty-skill'"
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].attempts).toBe(3);
  });
});
