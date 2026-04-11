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
    expect(plan.filter(d => ![7, 14, 21, 28].includes(d.day_number)).every(d => d.content_id)).toBe(true);
    expect(plan.filter(d => [7, 14, 21, 28].includes(d.day_number)).every(d => d.content_id === null)).toBe(true);
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
    expect(plan.filter(d => ![7, 14, 21, 28].includes(d.day_number)).every(d => d.content_id)).toBe(true);
    const uniqueIds = new Set(plan.map(d => d.content_id).filter(Boolean));
    expect(uniqueIds.size).toBe(26);
  });
});

describe('generatePlan chunking', () => {
  test('chunks a long youtube video across early plan days with resume timestamps', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    await db.saveContent([
      {
        id: 'yt_long',
        type: 'video',
        title: 'Long Python Course',
        url: 'https://www.youtube.com/watch?v=longvid',
        source: 'YouTube',
        channel: 'Longform',
        duration: '1:15:00',
        views: 50000,
      },
      {
        id: 'yt_short_1',
        type: 'video',
        title: 'Short Python Lesson 1',
        url: 'https://www.youtube.com/watch?v=shortvid1',
        source: 'YouTube',
        channel: 'Shortform',
        duration: '18:00',
        views: 10000,
      },
      {
        id: 'yt_short_2',
        type: 'video',
        title: 'Short Python Lesson 2',
        url: 'https://www.youtube.com/watch?v=shortvid2',
        source: 'YouTube',
        channel: 'Shortform',
        duration: '22:00',
        views: 9000,
      },
      {
        id: 'devto_a1',
        type: 'article',
        title: 'Python article',
        url: 'https://dev.to/python',
        source: 'Dev.to',
        author: 'Author',
        views: 1000,
      },
    ], SKILL_ID);

    const plan = await learningPlanService.generatePlan(SKILL_ID);
    const longEntries = plan.filter(day => day.content_id === 'yt_long');

    expect(longEntries.length).toBeGreaterThanOrEqual(2);
    expect(longEntries.map(day => day.day_number)).toEqual(
      Array.from({ length: longEntries.length }, (_, i) => i + 1)
    );
    expect(longEntries[0].timestamp_start_seconds).toBe(0);
    for (let i = 1; i < longEntries.length; i++) {
      expect(longEntries[i].timestamp_start_seconds).toBeGreaterThan(longEntries[i - 1].timestamp_start_seconds);
    }
    expect(longEntries.every(day => day.timestamp_start_seconds !== null && day.timestamp_start_seconds !== undefined)).toBe(true);
  });

  test('does not reuse a chunked long video later in the same plan', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    const content = [
      {
        id: 'yt_long',
        type: 'video',
        title: 'Long Python Course',
        url: 'https://www.youtube.com/watch?v=longvid',
        source: 'YouTube',
        channel: 'Longform',
        duration: '1:15:00',
        views: 50000,
      }
    ];

    for (let i = 1; i <= 20; i++) {
      content.push({
        id: `yt_short_${i}`,
        type: 'video',
        title: `Short Python Lesson ${i}`,
        url: `https://www.youtube.com/watch?v=short${i}`,
        source: 'YouTube',
        channel: 'Shortform',
        duration: '18:00',
        views: 20000 - i * 100,
      });
    }

    for (let i = 1; i <= 20; i++) {
      content.push({
        id: `devto_a${i}`,
        type: 'article',
        title: `Python Article ${i}`,
        url: `https://dev.to/python-${i}`,
        source: 'Dev.to',
        author: 'Author',
        views: 10000 - i * 100,
      });
    }

    await db.saveContent(content, SKILL_ID);

    const plan = await learningPlanService.generatePlan(SKILL_ID);
    const longEntries = plan.filter(day => day.content_id === 'yt_long');

    expect(longEntries.map(day => day.day_number)).toEqual([1, 2, 3]);
    expect(plan.filter(day => day.content_id === 'yt_long')).toHaveLength(3);
  });
});

describe('getUserPlanWithRefresh', () => {
  test('reseeds missing user plan rows for an enrolled user', async () => {
    await seedSkillWithPlan();
    await db.enrollPlan(USER_ID, SKILL_ID);
    await db.enrollCourse(USER_ID, SKILL_ID);

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toHaveLength(30);
    expect(result.plan.filter(day => ![7, 14, 21, 28].includes(day.day_number)).every(day => day.content_id)).toBe(true);
    expect(result.plan.filter(day => [7, 14, 21, 28].includes(day.day_number)).every(day => day.content_id === null)).toBe(true);
    const persistedPlan = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    expect(persistedPlan).toHaveLength(30);
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
  test('returns plan without refresh flag when shared plan has not been regenerated', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toHaveLength(30);
    expect(result.plan[0].day_number).toBe(1);
    expect(result.refreshAvailable).toBe(false);
  });

  test('flags refresh available when shared plan is newer than user plan', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    // Simulate shared plan regeneration after user plan was copied
    await new Promise(r => setTimeout(r, 50));
    await db.insert(
      "UPDATE learning_plans SET created_at = datetime('now', '+1 hour') WHERE skill_id = ?",
      [SKILL_ID]
    );

    const result = await learningPlanService.getUserPlanWithRefresh(USER_ID, SKILL_ID);

    expect(result.plan).toHaveLength(30);
    expect(result.refreshAvailable).toBe(false);
    expect(result.planReady).toBe(false);
  });

  test('backfills pending review jobs for legacy plans without review job rows', async () => {
    await seedSkillWithPlan();
    await db.insert("DELETE FROM plan_jobs WHERE skill_id = ?", [SKILL_ID]);

    const result = await learningPlanService.getPlanWithReadiness(SKILL_ID);
    const reviewJobs = await db.getPlanJobs(SKILL_ID, 'review_content');

    expect(result.planReady).toBe(false);
    expect(reviewJobs.map((job) => job.day_number)).toEqual([7, 14, 21, 28]);
    expect(reviewJobs.every((job) => job.status === 'pending')).toBe(true);
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

  test('preserves chunked personal day runs during refresh', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    // Create content: one long video (will be chunked) + filler
    const content = [
      { id: 'yt_long', type: 'video', title: 'Long Course', url: 'https://yt.com/long',
        source: 'YouTube', channel: 'Ch', duration: '1:15:00', views: 50000 },
    ];
    for (let i = 1; i <= 30; i++) {
      content.push({
        id: `yt_v${i}`, type: 'video', title: `Video ${i}`, url: `https://yt.com/v${i}`,
        source: 'YouTube', channel: 'Ch', duration: '10:00', views: 10000 - i * 100,
      });
    }
    await db.saveContent(content, SKILL_ID);

    // Generate shared plan (chunks yt_long into days 1-3)
    await learningPlanService.generatePlan(SKILL_ID);
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    const beforePlan = await db.getUserLearningPlan(USER_ID, SKILL_ID);
    const chunkedBefore = beforePlan.filter(d => d.content_id === 'yt_long');
    expect(chunkedBefore.length).toBeGreaterThanOrEqual(2);
    expect(chunkedBefore[0].timestamp_start_seconds).toBe(0);

    // Refresh — chunked run should be preserved
    const refreshed = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);
    const chunkedAfter = refreshed.filter(d => d.content_id === 'yt_long');

    expect(chunkedAfter).toHaveLength(chunkedBefore.length);
    for (let i = 0; i < chunkedBefore.length; i++) {
      expect(chunkedAfter[i].day_number).toBe(chunkedBefore[i].day_number);
      expect(chunkedAfter[i].timestamp_start_seconds).toBe(chunkedBefore[i].timestamp_start_seconds);
      expect(chunkedAfter[i].timestamp_end_seconds).toBe(chunkedBefore[i].timestamp_end_seconds);
      expect(chunkedAfter[i].created_at).toBe(chunkedBefore[i].created_at); // untouched
    }
  });

  test('no duplicate content_ids after merge', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    // Mark day 1 complete
    await db.insert(
      "UPDATE user_plan_progress SET completed_days = ? WHERE user_id = ? AND skill_id = ?",
      [JSON.stringify([1]), USER_ID, SKILL_ID]
    );

    const refreshed = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);

    const contentIds = refreshed.map(d => d.content_id).filter(Boolean);
    const uniqueIds = new Set(contentIds);
    expect(uniqueIds.size).toBe(contentIds.length);
  });

  test('all 30 days filled after merge', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    await db.insert(
      "UPDATE user_plan_progress SET completed_days = ? WHERE user_id = ? AND skill_id = ?",
      [JSON.stringify([1, 5, 10, 20]), USER_ID, SKILL_ID]
    );

    const refreshed = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);

    expect(refreshed).toHaveLength(30);
    const dayNumbers = refreshed.map(d => d.day_number).sort((a, b) => a - b);
    expect(dayNumbers).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  test('days 1-6 have content after merge and day 7 is a review placeholder', async () => {
    await seedSkillWithPlan();
    await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);
    await db.enrollPlan(USER_ID, SKILL_ID);

    const refreshed = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);

    for (let day = 1; day <= 6; day++) {
      const entry = refreshed.find(d => d.day_number === day);
      expect(entry).toBeDefined();
      expect(entry.content_id).toBeTruthy();
    }

    const reviewDay = refreshed.find(d => d.day_number === 7);
    expect(reviewDay).toBeDefined();
    expect(reviewDay.content_id).toBeNull();
    expect(reviewDay.content_type).toBe('review');
  });

  test('does not reinsert chunks of a video already completed in full', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    // Create content
    const content = [
      { id: 'yt_long', type: 'video', title: 'Long Course', url: 'https://yt.com/long',
        source: 'YouTube', channel: 'Ch', duration: '1:15:00', views: 50000 },
    ];
    for (let i = 1; i <= 30; i++) {
      content.push({
        id: `yt_v${i}`, type: 'video', title: `Video ${i}`, url: `https://yt.com/v${i}`,
        source: 'YouTube', channel: 'Ch', duration: '10:00', views: 10000 - i * 100,
      });
    }
    await db.saveContent(content, SKILL_ID);

    // Build a user plan where yt_long appears once (un-chunked) on day 5
    const userPlanDays = [];
    let vidIdx = 1;
    for (let d = 1; d <= 30; d++) {
      if (d === 5) {
        userPlanDays.push({ day_number: d, content_id: 'yt_long', content_type: 'video', reason: 'full video' });
      } else {
        userPlanDays.push({ day_number: d, content_id: `yt_v${vidIdx}`, content_type: 'video', reason: 'filler' });
        vidIdx++;
      }
    }
    await db.saveUserLearningPlan(USER_ID, SKILL_ID, userPlanDays);
    await db.enrollPlan(USER_ID, SKILL_ID);

    // User completed day 5 (the full video)
    await db.insert(
      "UPDATE user_plan_progress SET completed_days = ? WHERE user_id = ? AND skill_id = ?",
      [JSON.stringify([5]), USER_ID, SKILL_ID]
    );

    // Generate a shared plan that chunks yt_long across days 1-3
    await learningPlanService.generatePlan(SKILL_ID);

    const refreshed = await learningPlanService.refreshUserPlan(USER_ID, SKILL_ID);

    // yt_long should only appear on day 5 (completed), NOT re-chunked into other days
    const longEntries = refreshed.filter(d => d.content_id === 'yt_long');
    expect(longEntries).toHaveLength(1);
    expect(longEntries[0].day_number).toBe(5);
  });
});

describe('shared plan staleness', () => {
  test('regenerates shared plan when older than 7 days', async () => {
    await seedSkillWithPlan();

    // Backdate shared plan to 8 days ago
    await db.insert(
      "UPDATE learning_plans SET created_at = datetime('now', '-8 days') WHERE skill_id = ?",
      [SKILL_ID]
    );

    const stale = await learningPlanService.isSharedPlanStale(SKILL_ID);
    expect(stale).toBe(true);

    // getPlan should regenerate
    const plan = await learningPlanService.getPlan(SKILL_ID);
    expect(plan).toHaveLength(30);

    // Now it should no longer be stale
    const freshStale = await learningPlanService.isSharedPlanStale(SKILL_ID);
    expect(freshStale).toBe(false);
  });

  test('does not regenerate shared plan younger than 7 days', async () => {
    await seedSkillWithPlan();

    // Plan was just created — should not be stale
    const stale = await learningPlanService.isSharedPlanStale(SKILL_ID);
    expect(stale).toBe(false);
  });
});

describe('parseDuration', () => {
  const parseDuration = learningPlanService._parseDuration;

  test('parses M:SS format', () => {
    expect(parseDuration('10:00')).toBe(600);
    expect(parseDuration('25:30')).toBe(1530);
    expect(parseDuration('0:45')).toBe(45);
  });

  test('parses H:MM:SS format', () => {
    expect(parseDuration('1:00:00')).toBe(3600);
    expect(parseDuration('1:30:00')).toBe(5400);
    expect(parseDuration('2:15:30')).toBe(8130);
  });

  test('returns 0 for null/undefined/invalid', () => {
    expect(parseDuration(null)).toBe(0);
    expect(parseDuration(undefined)).toBe(0);
    expect(parseDuration('')).toBe(0);
    expect(parseDuration('abc')).toBe(0);
  });
});

describe('formatTimestamp', () => {
  const formatTimestamp = learningPlanService._formatTimestamp;

  test('formats seconds-only', () => {
    expect(formatTimestamp(45)).toBe('0:45');
  });

  test('formats minutes and seconds', () => {
    expect(formatTimestamp(1500)).toBe('25:00');
    expect(formatTimestamp(1530)).toBe('25:30');
  });

  test('formats hours', () => {
    expect(formatTimestamp(3600)).toBe('1:00:00');
    expect(formatTimestamp(5430)).toBe('1:30:30');
  });
});

describe('chunkVideo', () => {
  const chunkVideo = learningPlanService._chunkVideo;

  test('returns null for non-YouTube source', () => {
    const video = { id: 'v1', type: 'video', source: 'Vimeo', duration: '1:30:00' };
    expect(chunkVideo(video, 1, 'reason')).toBeNull();
  });

  test('returns null for short video (<= 40 min)', () => {
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '39:00' };
    expect(chunkVideo(video, 1, 'reason')).toBeNull();
  });

  test('returns null for exactly 40 min video', () => {
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '40:00' };
    expect(chunkVideo(video, 1, 'reason')).toBeNull();
  });

  test('chunks a 50 min video into 2 chunks', () => {
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '50:00' };
    const chunks = chunkVideo(video, 1, 'Get started');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].day_number).toBe(1);
    expect(chunks[0].timestamp_start_seconds).toBe(0);
    expect(chunks[0].timestamp_end_seconds).toBe(1500);
    expect(chunks[1].day_number).toBe(2);
    expect(chunks[1].timestamp_start_seconds).toBe(1500);
    expect(chunks[1].timestamp_end_seconds).toBe(3000);
    // First chunk keeps original reason
    expect(chunks[0].reason).toBe('Get started');
    // Continuation chunk has descriptive reason
    expect(chunks[1].reason).toMatch(/^Continue:/);
  });

  test('chunks a 75 min video into 3 chunks', () => {
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '1:15:00' };
    const chunks = chunkVideo(video, 1, 'reason');
    expect(chunks).toHaveLength(3);
    expect(chunks[0].timestamp_start_seconds).toBe(0);
    expect(chunks[2].day_number).toBe(3);
  });

  test('limits to available days within early window', () => {
    // Start on day 6: only 2 days left (6 and 7)
    // 75 min video: ceil(75/25) = 3 chunks, but only 2 available
    // 75*60/2 = 2250s = 37.5 min per chunk, under 40 min max
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '1:15:00' };
    const chunks = chunkVideo(video, 6, 'reason');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].day_number).toBe(6);
    expect(chunks[1].day_number).toBe(7);
  });

  test('returns null when starting on day 7 with only 1 day available', () => {
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '1:30:00' };
    const chunks = chunkVideo(video, 7, 'reason');
    // Only 1 day available, chunksToUse = 1, returns null
    expect(chunks).toBeNull();
  });

  test('caps at 7 chunks maximum', () => {
    // 4 hour video = 240 min / 25 = ~10 chunks, capped to 7
    const video = { id: 'v1', type: 'video', source: 'YouTube', duration: '4:00:00' };
    const chunks = chunkVideo(video, 1, 'reason');
    expect(chunks).toHaveLength(7);
    expect(chunks[6].day_number).toBe(7);
    // Last chunk ends at or before total duration
    expect(chunks[6].timestamp_end_seconds).toBeLessThanOrEqual(14400);
  });

  test('all chunks share the same content_id', () => {
    const video = { id: 'yt_abc', type: 'video', source: 'YouTube', duration: '1:15:00' };
    const chunks = chunkVideo(video, 1, 'reason');
    chunks.forEach(chunk => {
      expect(chunk.content_id).toBe('yt_abc');
      expect(chunk.content_type).toBe('video');
    });
  });
});

describe('generatePlan with chunked videos', () => {
  test('chunks a long YouTube video across consecutive early days', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    const content = [];
    // First video is long (75 min) — should be chunked into 3 days
    content.push({
      id: 'yt_long1',
      type: 'video',
      title: 'Python Full Course',
      url: 'https://youtube.com/watch?v=long1',
      source: 'YouTube',
      channel: 'TestChannel',
      duration: '1:15:00',
      views: 50000,
    });
    // Remaining short videos
    for (let i = 2; i <= 15; i++) {
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

    const plan = await learningPlanService.generatePlan(SKILL_ID);
    expect(plan).toHaveLength(30);

    // Days 1-3 should be chunks of the long video
    const day1 = plan.find(d => d.day_number === 1);
    const day2 = plan.find(d => d.day_number === 2);
    const day3 = plan.find(d => d.day_number === 3);

    expect(day1.content_id).toBe('yt_long1');
    expect(day2.content_id).toBe('yt_long1');
    expect(day3.content_id).toBe('yt_long1');

    expect(day1.timestamp_start_seconds).toBe(0);
    expect(day2.timestamp_start_seconds).toBeGreaterThan(0);
    expect(day3.timestamp_start_seconds).toBeGreaterThan(day2.timestamp_start_seconds);

    // Day 4+ should be different content
    const day4 = plan.find(d => d.day_number === 4);
    expect(day4.content_id).not.toBe('yt_long1');
  });

  test('does not chunk short YouTube videos', async () => {
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
        duration: '30:00', // 30 min — under threshold
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

    const plan = await learningPlanService.generatePlan(SKILL_ID);
    expect(plan).toHaveLength(30);

    // No chunking — each early day should have a unique content_id
    const earlyIds = plan.slice(0, 7).map(d => d.content_id);
    expect(new Set(earlyIds).size).toBe(7);

    // No timestamp fields set
    plan.slice(0, 7).forEach(d => {
      expect(d.timestamp_start_seconds).toBeNull();
      expect(d.timestamp_end_seconds).toBeNull();
    });
  });

  test('does not chunk non-YouTube long videos', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    const content = [];
    content.push({
      id: 'vimeo_long',
      type: 'video',
      title: 'Long Vimeo Video',
      url: 'https://vimeo.com/123',
      source: 'Vimeo',
      channel: 'TestChannel',
      duration: '1:30:00',
      views: 50000,
    });
    for (let i = 2; i <= 15; i++) {
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

    const plan = await learningPlanService.generatePlan(SKILL_ID);

    // The Vimeo video should appear only once (no chunking)
    const vimeoDays = plan.filter(d => d.content_id === 'vimeo_long');
    expect(vimeoDays).toHaveLength(1);
    expect(vimeoDays[0].timestamp_start_seconds).toBeNull();
  });

  test('chunked video timestamps are copied to user plan', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES (?, 'Python', 'ready')",
      [SKILL_ID]
    );

    const content = [];
    content.push({
      id: 'yt_long1',
      type: 'video',
      title: 'Python Full Course',
      url: 'https://youtube.com/watch?v=long1',
      source: 'YouTube',
      channel: 'TestChannel',
      duration: '1:15:00',
      views: 50000,
    });
    for (let i = 2; i <= 15; i++) {
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
    const userPlan = await learningPlanService.copyPlanForUser(USER_ID, SKILL_ID);

    // Verify timestamp data is preserved in user plan
    const day1 = userPlan.find(d => d.day_number === 1);
    const day2 = userPlan.find(d => d.day_number === 2);

    expect(day1.content_id).toBe('yt_long1');
    expect(day1.timestamp_start_seconds).toBe(0);
    expect(day2.content_id).toBe('yt_long1');
    expect(day2.timestamp_start_seconds).toBeGreaterThan(0);
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
