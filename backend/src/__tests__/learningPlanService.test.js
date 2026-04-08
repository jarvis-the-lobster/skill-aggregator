const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);

const learningPlanService = require('../services/learningPlanService');

let db;
const USER_ID = 1;
const SKILL_ID = 'python';

// Helper: seed a skill, content, and shared learning plan
async function seedSkillWithPlan() {
  await db.insert(
    "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
    [SKILL_ID]
  );

  // Insert enough content so the plan generator has material
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

  // Generate shared plan
  await learningPlanService.generatePlan(SKILL_ID);
}

async function createUser() {
  await db.insert(
    "INSERT INTO users (id, email, password_hash) VALUES (?, 'test@test.com', 'hash')",
    [USER_ID]
  );
}

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  await createUser();
});

afterAll(async () => {
  await db.close();
});

describe('getPlan', () => {
  test('regenerates an incomplete shared plan with missing day rows', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    const content = [];
    for (let i = 1; i <= 20; i++) {
      content.push({
        id: `yt_v${i}`,
        type: 'video',
        title: `Python Video ${i}`,
        url: `https://yt.com/v${i}`,
        source: 'YouTube',
        channel: 'TestChannel',
        duration: '10:00',
        views: 20000 - i * 100,
      });
    }
    for (let i = 1; i <= 20; i++) {
      content.push({
        id: `devto_a${i}`,
        type: 'article',
        title: `Python Article ${i}`,
        url: `https://dev.to/a${i}`,
        source: 'Dev.to',
        author: 'Author',
        tags: ['python'],
        views: 10000 - i * 100,
      });
    }
    await db.saveContent(content, SKILL_ID);

    await db.saveLearningPlan(SKILL_ID, [
      { day_number: 1, content_id: 'yt_v1', content_type: 'video', reason: 'seed' },
      { day_number: 2, content_id: 'yt_v2', content_type: 'video', reason: 'seed' },
      { day_number: 4, content_id: 'yt_v3', content_type: 'video', reason: 'seed' },
    ]);

    const plan = await learningPlanService.getPlan(SKILL_ID);

    expect(plan).toHaveLength(30);
    expect(plan.map(d => d.day_number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(plan.every(d => d.content_id)).toBe(true);
  });

  test('regenerates an incomplete shared plan with null content rows', async () => {
    await seedSkillWithPlan();

    const brokenPlan = Array.from({ length: 30 }, (_, i) => ({
      day_number: i + 1,
      content_id: i === 4 || i === 5 ? null : (i < 15 ? `yt_v${i + 1}` : `devto_a${i - 14}`),
      content_type: i === 4 || i === 5 ? null : (i < 15 ? 'video' : 'article'),
      reason: 'seed',
    }));
    await db.saveLearningPlan(SKILL_ID, brokenPlan);

    const plan = await learningPlanService.getPlan(SKILL_ID);

    expect(plan).toHaveLength(30);
    expect(plan.every(d => d.content_id)).toBe(true);
    const uniqueIds = new Set(plan.map(d => d.content_id));
    expect(uniqueIds.size).toBe(30);
  });
});

describe('copyPlanForUser', () => {
  test('enrolling creates a personal plan copy (30 days)', async () => {
    await seedSkillWithPlan();

    const userPlan = await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);

    expect(userPlan).toHaveLength(30);
    expect(userPlan[0].day_number).toBe(1);
    expect(userPlan[29].day_number).toBe(30);
    // First day should be a video
    expect(userPlan[0].content_type).toBe('video');
  });

  test('re-enrollment replaces existing plan', async () => {
    await seedSkillWithPlan();

    const firstPlan = await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    expect(firstPlan).toHaveLength(30);

    // Re-enroll — should replace, not duplicate
    const secondPlan = await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    expect(secondPlan).toHaveLength(30);

    // Verify no duplicates by checking total rows
    const allRows = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    expect(allRows).toHaveLength(30);
  });
});

describe('getUserPlanWithRefresh', () => {
  test('returns plan without refresh flag when content has not changed', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toHaveLength(30);
    expect(result.plan[0].day_number).toBe(1);
    expect(result.refreshAvailable).toBe(false);
  });

  test('flags refresh available when new content exists', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    await new Promise(r => setTimeout(r, 50));
    await db.insert(
      "UPDATE skills SET last_scraped_at = datetime('now', '+1 hour') WHERE id = ?",
      [SKILL_ID]
    );

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toHaveLength(30);
    expect(result.refreshAvailable).toBe(true);
  });

  test('returns empty plan when no user plan exists', async () => {
    await seedSkillWithPlan();

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toEqual([]);
    expect(result.refreshAvailable).toBe(false);
  });
});

describe('refreshUserPlan', () => {
  test('preserves completed days content and refreshes incomplete days', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    // Mark days 1, 2, and 8 (first article day) as completed
    await db.insert(
      "UPDATE user_plan_progress SET completed_days = ? WHERE user_id = ? AND skill_id = ?",
      [JSON.stringify([1, 2, 8]), USER_ID, SKILL_ID]
    );

    // Record original state for completed days
    const beforeRows = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    const day1Before = beforeRows.find(d => d.day_number === 1);
    const day2Before = beforeRows.find(d => d.day_number === 2);
    const day8Before = beforeRows.find(d => d.day_number === 8);
    const day3Before = beforeRows.find(d => d.day_number === 3);

    // Add new content that could change the plan ordering
    for (let i = 100; i < 115; i++) {
      await db.saveContent([{
        id: `devto_new${i}`,
        type: 'article',
        title: `New Article ${i}`,
        url: `https://dev.to/new${i}`,
        source: 'Dev.to',
        author: 'Author',
        views: 50000 + i * 100, // high views to change sort order
        tags: [],
      }], SKILL_ID);
    }

    // Simulate new content scraped
    await new Promise(r => setTimeout(r, 50));
    await db.insert(
      "UPDATE skills SET last_scraped_at = datetime('now', '+1 hour') WHERE id = ?",
      [SKILL_ID]
    );

    const refreshedPlan = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);
    expect(refreshedPlan).toHaveLength(30);

    // Completed days should keep EXACT same content_id
    const day1After = refreshedPlan.find(d => d.day_number === 1);
    const day2After = refreshedPlan.find(d => d.day_number === 2);
    const day8After = refreshedPlan.find(d => d.day_number === 8);

    expect(day1After.content_id).toBe(day1Before.content_id);
    expect(day2After.content_id).toBe(day2Before.content_id);
    expect(day8After.content_id).toBe(day8Before.content_id);

    // Completed days should keep original created_at
    expect(day1After.created_at).toBe(day1Before.created_at);
    expect(day8After.created_at).toBe(day8Before.created_at);

    // Incomplete day (3) should have a newer created_at (was refreshed)
    const day3After = refreshedPlan.find(d => d.day_number === 3);
    expect(new Date(day3After.created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(day3Before.created_at).getTime()
    );
  });
});

describe('unenrollment', () => {
  test('deletes user plan entries', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);

    // Verify plan exists
    const before = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    expect(before).toHaveLength(30);

    // Delete
    await db.deleteUserLearningPlan(USER_ID, SKILL_ID);

    const after = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    expect(after).toHaveLength(0);
  });
});
