const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);

const skillMergeService = require('../services/skillMergeService');

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

// ── seed helpers ────────────────────────────────────────────────────

async function seedSkill(id, name, status = 'ready') {
  await db.insert("INSERT INTO skills (id, name, status) VALUES (?, ?, ?)", [id, name, status]);
}

async function seedContent(id, skillId, title = 'Test') {
  await db.insert(
    "INSERT OR REPLACE INTO content (id, skill_id, type, title, url, source) VALUES (?, ?, 'video', ?, ?, 'YouTube')",
    [id, skillId, title, `https://yt.com/${id}`]
  );
}

async function seedUser(id) {
  await db.insert("INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'hash')", [id, `user${id}@test.com`]);
}

async function seedUserCourse(userId, skillId, { status = 'active', enrolled_at = '2025-01-01', last_activity_at = null } = {}) {
  await db.insert(
    "INSERT INTO user_courses (user_id, skill_id, status, enrolled_at, last_activity_at) VALUES (?, ?, ?, ?, ?)",
    [userId, skillId, status, enrolled_at, last_activity_at]
  );
}

async function seedPlanProgress(userId, skillId, { completed_days = '[]', enrolled_at = '2025-01-01', last_activity_at = null } = {}) {
  await db.insert(
    "INSERT INTO user_plan_progress (user_id, skill_id, completed_days, enrolled_at, last_activity_at) VALUES (?, ?, ?, ?, ?)",
    [userId, skillId, completed_days, enrolled_at, last_activity_at]
  );
}

async function seedLearningPlan(skillId, day, contentId, opts = {}) {
  await db.insert(
    `INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason, timestamp_start_seconds, timestamp_end_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [skillId, day, contentId, opts.content_type || 'video', opts.reason || null,
     opts.timestamp_start_seconds ?? null, opts.timestamp_end_seconds ?? null]
  );
}

async function seedUserLearningPlan(userId, skillId, day, contentId, opts = {}) {
  await db.insert(
    `INSERT INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, timestamp_start_seconds, timestamp_end_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, skillId, day, contentId, opts.content_type || 'video', opts.reason || null,
     opts.timestamp_start_seconds ?? null, opts.timestamp_end_seconds ?? null]
  );
}

async function seedScrapeLog(skillId, source = 'youtube') {
  await db.insert(
    "INSERT INTO scrape_log (skill_id, source, status, items_fetched) VALUES (?, ?, 'success', 5)",
    [skillId, source]
  );
}

async function seedPremiumUser(id) {
  await db.insert(
    "INSERT INTO users (id, email, password_hash, subscription_status) VALUES (?, ?, 'hash', 'active')",
    [id, `premium${id}@test.com`]
  );
}

async function seedPlanJob(skillId, userId, opts = {}) {
  const result = await db.insert(
    `INSERT INTO plan_jobs (skill_id, user_id, job_type, status, day_number)
     VALUES (?, ?, ?, ?, ?)`,
    [skillId, userId, opts.job_type || 'review_content', opts.status || 'pending', opts.day_number || 1]
  );
  return result.id;
}

async function seedPlanReviewContent(skillId, userId, dayNumber, opts = {}) {
  const result = await db.insert(
    `INSERT INTO plan_review_content (skill_id, user_id, day_number, review_type, title, body)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [skillId, userId, dayNumber, opts.review_type || 'weekly_checkin', opts.title || 'Review', opts.body || '{}']
  );
  return result.id;
}

async function seedReviewSubmission(userId, skillId, dayNumber, opts = {}) {
  const result = await db.insert(
    `INSERT INTO review_submissions (user_id, skill_id, day_number, status, result_summary, reflection)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, skillId, dayNumber, opts.status || 'completed', opts.result_summary || null, opts.reflection || null]
  );
  return result.id;
}

async function seedReviewSubmissionAnswer(submissionId, checkId, opts = {}) {
  await db.insert(
    `INSERT INTO review_submission_answers (submission_id, check_id, question, check_type, answer, correct)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [submissionId, checkId, opts.question || 'Q?', opts.check_type || 'short_answer', opts.answer || 'A', opts.correct ?? null]
  );
}

async function seedPremiumPlanDay(userId, skillId, dayNumber, opts = {}) {
  await db.insert(
    `INSERT INTO premium_plan_days (user_id, skill_id, day_number, content_id, content_type, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, skillId, dayNumber, opts.content_id || null, opts.content_type || 'video', opts.reason || null, opts.status || 'pending_merge']
  );
}

async function seedUserLearningPlanWithReview(userId, skillId, day, contentId, opts = {}) {
  await db.insert(
    `INSERT INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, skillId, day, contentId, opts.content_type || 'video', opts.reason || null,
     opts.review_status || 'ready', opts.review_title || null, opts.review_body || null,
     opts.timestamp_start_seconds ?? null, opts.timestamp_end_seconds ?? null]
  );
}

// ── tests ───────────────────────────────────────────────────────────

describe('SkillMergeService', () => {

  describe('dry-run reports counts without mutating data', () => {
    test('returns structured impact report and does not modify any table', async () => {
      await seedSkill('typo-skill', 'Typo Skill');
      await seedSkill('real-skill', 'Real Skill');
      await seedUser(1);
      await seedContent('c1', 'typo-skill', 'Video 1');
      await seedContent('c2', 'typo-skill', 'Video 2');
      await seedContent('c3', 'real-skill', 'Video 3');
      await seedUserCourse(1, 'typo-skill');
      await seedPlanProgress(1, 'typo-skill', { completed_days: '[1,2]' });
      await seedScrapeLog('typo-skill');

      const result = await skillMergeService.safeMerge('typo-skill', 'real-skill', { dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.mode).toBe('merge');
      expect(result.impact.content.source_count).toBe(2);
      expect(result.impact.content.target_count).toBe(1);
      expect(result.impact.content.will_move).toBe(2);
      expect(result.impact.user_courses.source_count).toBe(1);
      expect(result.impact.scrape_log.source_count).toBe(1);

      // Verify nothing was mutated
      const sourceSkill = await db.query("SELECT id FROM skills WHERE id = 'typo-skill'");
      expect(sourceSkill.length).toBe(1);
      const sourceContent = await db.query("SELECT id FROM content WHERE skill_id = 'typo-skill'");
      expect(sourceContent.length).toBe(2);
      const sourceCourses = await db.query("SELECT id FROM user_courses WHERE skill_id = 'typo-skill'");
      expect(sourceCourses.length).toBe(1);
    });
  });

  describe('rename: typo → new canonical target', () => {
    test('migrates all relevant tables when target does not exist', async () => {
      await seedSkill('busines-consulting', 'Busines Consulting');
      await seedUser(1);
      await seedUser(2);
      await seedContent('c1', 'busines-consulting');
      await seedContent('c2', 'busines-consulting');
      await seedUserCourse(1, 'busines-consulting', { status: 'active', enrolled_at: '2025-03-01' });
      await seedUserCourse(2, 'busines-consulting', { status: 'completed' });
      await seedPlanProgress(1, 'busines-consulting', { completed_days: '[1,2,3]' });
      await seedLearningPlan('busines-consulting', 1, 'c1');
      await seedLearningPlan('busines-consulting', 2, 'c2');
      await seedUserLearningPlan(1, 'busines-consulting', 1, 'c1');
      await seedUserLearningPlan(1, 'busines-consulting', 2, 'c2');
      await seedScrapeLog('busines-consulting');
      await seedScrapeLog('busines-consulting', 'dev-to');

      const result = await skillMergeService.safeMerge('busines-consulting', 'business-consulting', { dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(result.mode).toBe('rename');

      // Source should be gone
      const source = await db.query("SELECT id FROM skills WHERE id = 'busines-consulting'");
      expect(source.length).toBe(0);

      // Target should exist
      const target = await db.query("SELECT * FROM skills WHERE id = 'business-consulting'");
      expect(target.length).toBe(1);
      expect(target[0].name).toBe('Busines Consulting');

      // All content migrated
      const content = await db.query("SELECT id FROM content WHERE skill_id = 'business-consulting'");
      expect(content.length).toBe(2);

      // User courses migrated
      const courses = await db.query("SELECT * FROM user_courses WHERE skill_id = 'business-consulting'");
      expect(courses.length).toBe(2);

      // Plan progress migrated
      const progress = await db.query("SELECT * FROM user_plan_progress WHERE skill_id = 'business-consulting'");
      expect(progress.length).toBe(1);
      expect(JSON.parse(progress[0].completed_days)).toEqual([1, 2, 3]);

      // Learning plans migrated
      const plans = await db.query("SELECT * FROM learning_plans WHERE skill_id = 'business-consulting'");
      expect(plans.length).toBe(2);

      // User learning plans migrated
      const userPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'business-consulting'");
      expect(userPlans.length).toBe(2);

      // Scrape logs stay on source for historical accuracy
      const logs = await db.query("SELECT * FROM scrape_log WHERE skill_id = 'business-consulting'");
      expect(logs.length).toBe(0);

      // Nothing left under source
      const srcContent = await db.query("SELECT id FROM content WHERE skill_id = 'busines-consulting'");
      expect(srcContent.length).toBe(0);
    });
  });

  describe('merge: source → existing target', () => {
    test('migrates all relevant tables with conflict resolution', async () => {
      await seedSkill('src-skill', 'Source');
      await seedSkill('tgt-skill', 'Target');
      await seedUser(1);
      await seedUser(2);

      // Content: distinct IDs across source and target
      await seedContent('c1', 'src-skill');
      await seedContent('c2', 'src-skill');
      await seedContent('c3', 'tgt-skill');

      // User courses: user 1 in both, user 2 only in source
      await seedUserCourse(1, 'src-skill', { status: 'active', enrolled_at: '2025-01-01', last_activity_at: '2025-03-01' });
      await seedUserCourse(1, 'tgt-skill', { status: 'completed', enrolled_at: '2025-02-01', last_activity_at: '2025-02-15' });
      await seedUserCourse(2, 'src-skill', { status: 'active', enrolled_at: '2025-01-15' });

      // Plan progress: user 1 in both, user 2 only in source
      await seedPlanProgress(1, 'src-skill', { completed_days: '[1,3,5]', last_activity_at: '2025-03-01' });
      await seedPlanProgress(1, 'tgt-skill', { completed_days: '[1,2,4]', last_activity_at: '2025-02-15' });
      await seedPlanProgress(2, 'src-skill', { completed_days: '[1]' });

      // Learning plans: target has plans, source should be dropped
      await seedLearningPlan('src-skill', 1, 'c1');
      await seedLearningPlan('tgt-skill', 1, 'c3');
      await seedLearningPlan('tgt-skill', 2, 'c1');

      // Scrape logs
      await seedScrapeLog('src-skill');

      const result = await skillMergeService.safeMerge('src-skill', 'tgt-skill', { dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(result.mode).toBe('merge');

      // Source gone
      const source = await db.query("SELECT id FROM skills WHERE id = 'src-skill'");
      expect(source.length).toBe(0);

      // Content: c1 and c2 moved from source, c3 stays
      const content = await db.query("SELECT id FROM content WHERE skill_id = 'tgt-skill' ORDER BY id");
      expect(content.map(r => r.id)).toEqual(['c1', 'c2', 'c3']);
      const srcContent = await db.query("SELECT id FROM content WHERE skill_id = 'src-skill'");
      expect(srcContent.length).toBe(0);

      // User courses: user 1 merged (active wins over completed), user 2 moved
      const courses = await db.query("SELECT * FROM user_courses WHERE skill_id = 'tgt-skill' ORDER BY user_id");
      expect(courses.length).toBe(2);
      const user1Course = courses.find(r => r.user_id === 1);
      expect(user1Course.status).toBe('active'); // active > completed
      expect(user1Course.enrolled_at).toBe('2025-01-01'); // earliest
      expect(user1Course.last_activity_at).toBe('2025-03-01'); // latest

      // Plan progress: user 1 days merged, user 2 moved
      const progress = await db.query("SELECT * FROM user_plan_progress WHERE skill_id = 'tgt-skill' ORDER BY user_id");
      expect(progress.length).toBe(2);
      const user1Progress = progress.find(r => r.user_id === 1);
      expect(JSON.parse(user1Progress.completed_days)).toEqual([1, 2, 3, 4, 5]); // union
      expect(user1Progress.last_activity_at).toBe('2025-03-01'); // latest

      // Learning plans: target's kept, source's deleted
      const plans = await db.query("SELECT * FROM learning_plans WHERE skill_id = 'tgt-skill'");
      expect(plans.length).toBe(2);
      const srcPlans = await db.query("SELECT * FROM learning_plans WHERE skill_id = 'src-skill'");
      expect(srcPlans.length).toBe(0);

      // Scrape log stays on source
      const logs = await db.query("SELECT * FROM scrape_log WHERE skill_id = 'tgt-skill'");
      expect(logs.length).toBe(0);
    });
  });

  describe('user_learning_plans preserved/merged', () => {
    test('user plans without target conflict are repointed', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedUserLearningPlan(1, 'src', 1, 'c1');
      await seedUserLearningPlan(1, 'src', 2, 'c2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      expect(plans.length).toBe(2);
      expect(plans[0].content_id).toBe('c1');
      expect(plans[1].content_id).toBe('c2');

      const srcPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'src'");
      expect(srcPlans.length).toBe(0);
    });

    test('user plans with conflict: immutable completed days preserved, non-immutable realign to shared plan', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      // Target shared plan
      await seedContent('tc1', 'tgt');
      await seedContent('tc2', 'tgt');
      await seedContent('tc3', 'tgt');
      await seedLearningPlan('tgt', 1, 'tc1');
      await seedLearningPlan('tgt', 2, 'tc2');
      await seedLearningPlan('tgt', 3, 'tc3');

      // User has target plan with day 1 completed
      await seedUserLearningPlan(1, 'tgt', 1, 'tc1');
      await seedUserLearningPlan(1, 'tgt', 2, 'old-content');
      await seedPlanProgress(1, 'tgt', { completed_days: '[1]' });

      // User also has source plan
      await seedUserLearningPlan(1, 'src', 1, 'sc1');
      await seedUserLearningPlan(1, 'src', 2, 'sc2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");

      // Day 1: immutable (completed) — kept as tc1
      const day1 = plans.find(r => r.day_number === 1);
      expect(day1.content_id).toBe('tc1');

      // Day 2: not completed, realigned to shared plan's tc2
      const day2 = plans.find(r => r.day_number === 2);
      expect(day2.content_id).toBe('tc2');

      // Day 3: realigned to shared plan's tc3
      const day3 = plans.find(r => r.day_number === 3);
      expect(day3.content_id).toBe('tc3');

      // Source plans deleted
      const srcPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'src'");
      expect(srcPlans.length).toBe(0);
    });

    test('timestamped/chunked rows are immutable', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      // Target user plan with chunked row on day 2
      await seedUserLearningPlan(1, 'tgt', 1, 'tc1');
      await seedUserLearningPlan(1, 'tgt', 2, 'tc2_chunk1', {
        timestamp_start_seconds: 0,
        timestamp_end_seconds: 1500,
      });

      // Shared plan wants different content on day 2
      await seedLearningPlan('tgt', 1, 'tc1');
      await seedLearningPlan('tgt', 2, 'different-content');

      // Source plan
      await seedUserLearningPlan(1, 'src', 1, 'sc1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      const day2 = plans.find(r => r.day_number === 2);
      // Chunked row preserved despite shared plan wanting different content
      expect(day2.content_id).toBe('tc2_chunk1');
      expect(day2.timestamp_start_seconds).toBe(0);
      expect(day2.timestamp_end_seconds).toBe(1500);
    });
  });

  describe('duplicate user_courses merge correctly', () => {
    test('active beats completed, earliest enrolled_at, latest last_activity_at', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      await seedUserCourse(1, 'src', { status: 'active', enrolled_at: '2025-01-01', last_activity_at: '2025-04-01' });
      await seedUserCourse(1, 'tgt', { status: 'completed', enrolled_at: '2025-02-01', last_activity_at: '2025-03-15' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const courses = await db.query("SELECT * FROM user_courses WHERE skill_id = 'tgt'");
      expect(courses.length).toBe(1);
      expect(courses[0].status).toBe('active');
      expect(courses[0].enrolled_at).toBe('2025-01-01');
      expect(courses[0].last_activity_at).toBe('2025-04-01');

      const srcCourses = await db.query("SELECT * FROM user_courses WHERE skill_id = 'src'");
      expect(srcCourses.length).toBe(0);
    });

    test('completed beats unknown status', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      await seedUserCourse(1, 'src', { status: 'completed', enrolled_at: '2025-02-01' });
      await seedUserCourse(1, 'tgt', { status: 'unknown', enrolled_at: '2025-01-01' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const courses = await db.query("SELECT * FROM user_courses WHERE skill_id = 'tgt'");
      expect(courses[0].status).toBe('completed');
    });
  });

  describe('duplicate user_plan_progress merge completed days correctly', () => {
    test('union of completed_days with correct timestamps', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      await seedPlanProgress(1, 'src', {
        completed_days: '[1,3,5,7]',
        enrolled_at: '2025-01-01',
        last_activity_at: '2025-04-01',
      });
      await seedPlanProgress(1, 'tgt', {
        completed_days: '[2,3,4,6]',
        enrolled_at: '2025-02-01',
        last_activity_at: '2025-03-15',
      });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const progress = await db.query("SELECT * FROM user_plan_progress WHERE skill_id = 'tgt'");
      expect(progress.length).toBe(1);
      expect(JSON.parse(progress[0].completed_days)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(progress[0].enrolled_at).toBe('2025-01-01');
      expect(progress[0].last_activity_at).toBe('2025-04-01');

      const srcProgress = await db.query("SELECT * FROM user_plan_progress WHERE skill_id = 'src'");
      expect(srcProgress.length).toBe(0);
    });
  });

  describe('content duplicate behavior is safe', () => {
    test('content with same id (INSERT OR REPLACE): last writer wins, merge moves remaining', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');

      // INSERT OR REPLACE means shared-id ends up under 'tgt' (last write wins)
      await seedContent('shared-id', 'src', 'Source Version');
      await seedContent('shared-id', 'tgt', 'Target Version'); // overwrites, now under tgt
      await seedContent('unique-src', 'src', 'Unique Source');

      // Verify pre-state: shared-id belongs to tgt, unique-src to src
      const preSrc = await db.query("SELECT id FROM content WHERE skill_id = 'src'");
      expect(preSrc.map(r => r.id)).toEqual(['unique-src']);

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const content = await db.query("SELECT * FROM content WHERE skill_id = 'tgt' ORDER BY id");
      expect(content.length).toBe(2);
      expect(content.find(r => r.id === 'shared-id').title).toBe('Target Version');
      expect(content.find(r => r.id === 'unique-src')).toBeTruthy();

      const srcContent = await db.query("SELECT * FROM content WHERE skill_id = 'src'");
      expect(srcContent.length).toBe(0);
    });

    test('all source content moves to target when no id overlap', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');

      await seedContent('src-c1', 'src', 'Source 1');
      await seedContent('src-c2', 'src', 'Source 2');
      await seedContent('tgt-c1', 'tgt', 'Target 1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const content = await db.query("SELECT id FROM content WHERE skill_id = 'tgt' ORDER BY id");
      expect(content.map(r => r.id)).toEqual(['src-c1', 'src-c2', 'tgt-c1']);
    });
  });

  describe('user state precedence and transfer', () => {
    test('preserves target immutable user-plan rows when the same completed day exists on both plans', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      await seedContent('src-c1', 'src', 'Source Completed Content');
      await seedContent('tgt-c1', 'tgt', 'Target Completed Content');
      await seedLearningPlan('src', 1, 'src-c1');
      await seedLearningPlan('tgt', 1, 'tgt-c1');

      await seedPlanProgress(1, 'src', { completed_days: '[1]' });
      await seedPlanProgress(1, 'tgt', { completed_days: '[1]' });
      await seedUserLearningPlan(1, 'src', 1, 'src-c1');
      await seedUserLearningPlan(1, 'tgt', 1, 'tgt-c1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const rows = await db.query(
        "SELECT day_number, content_id FROM user_learning_plans WHERE user_id = 1 AND skill_id = 'tgt' AND day_number = 1"
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].content_id).toBe('tgt-c1');
    });

    test('fully transfers source-only enrolled user state onto target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedContent('src-c1', 'src', 'Source 1');
      await seedLearningPlan('src', 1, 'src-c1');
      for (let day = 1; day <= 30; day++) {
        const contentId = `tgt-c${day}`;
        await seedContent(contentId, 'tgt', `Target ${day}`);
        await seedLearningPlan('tgt', day, contentId);
      }
      await seedUserCourse(1, 'src');
      await seedPlanProgress(1, 'src', { completed_days: '[1,2]' });
      await seedUserLearningPlan(1, 'src', 1, 'src-c1');
      await seedUserLearningPlan(1, 'src', 2, 'src-c1');
      await seedScrapeLog('src');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const tgtCourse = await db.query("SELECT * FROM user_courses WHERE user_id = 1 AND skill_id = 'tgt'");
      expect(tgtCourse).toHaveLength(1);

      const tgtProgress = await db.query("SELECT * FROM user_plan_progress WHERE user_id = 1 AND skill_id = 'tgt'");
      expect(tgtProgress).toHaveLength(1);
      expect(tgtProgress[0].completed_days).toBe('[1,2]');

      const tgtUserPlan = await db.query("SELECT * FROM user_learning_plans WHERE user_id = 1 AND skill_id = 'tgt'");
      expect(tgtUserPlan).toHaveLength(30);

      const srcCourse = await db.query("SELECT * FROM user_courses WHERE user_id = 1 AND skill_id = 'src'");
      const srcProgress = await db.query("SELECT * FROM user_plan_progress WHERE user_id = 1 AND skill_id = 'src'");
      const srcUserPlan = await db.query("SELECT * FROM user_learning_plans WHERE user_id = 1 AND skill_id = 'src'");
      expect(srcCourse).toHaveLength(0);
      expect(srcProgress).toHaveLength(0);
      expect(srcUserPlan).toHaveLength(0);
    });

    test('leaves scrape_log on source skill for historical accuracy', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedScrapeLog('src');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const srcLogs = await db.query("SELECT * FROM scrape_log WHERE skill_id = 'src'");
      const tgtLogs = await db.query("SELECT * FROM scrape_log WHERE skill_id = 'tgt'");
      expect(srcLogs).toHaveLength(1);
      expect(tgtLogs).toHaveLength(0);
    });
  });

  describe('source deleted only after success', () => {
    test('source skill is deleted after all migrations complete', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedContent('c1', 'src');
      await seedUserCourse(1, 'src');
      await seedPlanProgress(1, 'src', { completed_days: '[1]' });
      await seedUserLearningPlan(1, 'src', 1, 'c1');
      await seedLearningPlan('src', 1, 'c1');
      await seedScrapeLog('src');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      // Source skill deleted
      const source = await db.query("SELECT id FROM skills WHERE id = 'src'");
      expect(source.length).toBe(0);

      // All source references gone
      const srcContent = await db.query("SELECT id FROM content WHERE skill_id = 'src'");
      expect(srcContent.length).toBe(0);
      const srcCourses = await db.query("SELECT id FROM user_courses WHERE skill_id = 'src'");
      expect(srcCourses.length).toBe(0);
      const srcProgress = await db.query("SELECT id FROM user_plan_progress WHERE skill_id = 'src'");
      expect(srcProgress.length).toBe(0);
      const srcUserPlans = await db.query("SELECT id FROM user_learning_plans WHERE skill_id = 'src'");
      expect(srcUserPlans.length).toBe(0);
      const srcPlans = await db.query("SELECT id FROM learning_plans WHERE skill_id = 'src'");
      expect(srcPlans.length).toBe(0);
      const srcLogs = await db.query("SELECT id FROM scrape_log WHERE skill_id = 'src'");
      expect(srcLogs.length).toBe(1);

      // But all user/stateful data exists under target
      const tgtContent = await db.query("SELECT id FROM content WHERE skill_id = 'tgt'");
      expect(tgtContent.length).toBe(1);
      const tgtCourses = await db.query("SELECT id FROM user_courses WHERE skill_id = 'tgt'");
      expect(tgtCourses.length).toBe(1);
    });
  });

  describe('validation', () => {
    test('rejects when source not found', async () => {
      await expect(
        skillMergeService.safeMerge('nonexistent', 'target', { dryRun: true })
      ).rejects.toThrow("Source skill 'nonexistent' not found");
    });

    test('rejects when sourceId equals targetId', async () => {
      await expect(
        skillMergeService.safeMerge('same', 'same', { dryRun: true })
      ).rejects.toThrow('sourceId and targetId must differ');
    });

    test('rejects when missing params', async () => {
      await expect(
        skillMergeService.safeMerge(null, 'target', { dryRun: true })
      ).rejects.toThrow('sourceId and targetId required');
    });
  });

  describe('learning_plans merge logic', () => {
    test('moves source learning plan to target when target has none', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedContent('c1', 'src');
      await seedLearningPlan('src', 1, 'c1');
      await seedLearningPlan('src', 2, 'c1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM learning_plans WHERE skill_id = 'tgt'");
      expect(plans.length).toBe(2);
    });

    test('keeps target learning plan when target already has one', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedContent('c1', 'src');
      await seedContent('c2', 'tgt');
      await seedLearningPlan('src', 1, 'c1');
      await seedLearningPlan('tgt', 1, 'c2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM learning_plans WHERE skill_id = 'tgt'");
      expect(plans.length).toBe(1);
      expect(plans[0].content_id).toBe('c2'); // target's kept
    });
  });

  // ── Premium user winner-plan behavior ──────────────────────────────

  describe('premium user learning plan merge (winner-pick)', () => {
    test('source-only premium plans repoint to target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);
      await seedUserLearningPlan(10, 'src', 1, 'c1');
      await seedUserLearningPlan(10, 'src', 2, 'c2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 10 ORDER BY day_number");
      expect(plans.length).toBe(2);
      expect(plans[0].content_id).toBe('c1');
      expect(plans[1].content_id).toBe('c2');

      const srcPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'src'");
      expect(srcPlans.length).toBe(0);
    });

    test('target-only premium plans are kept as-is', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);
      // No source plans for user 10, but they have target plans
      await seedUserLearningPlan(10, 'tgt', 1, 'tc1');
      // Need source plans for another user to trigger merge
      await seedUser(99);
      await seedUserLearningPlan(99, 'src', 1, 'sc1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 10");
      expect(plans.length).toBe(1);
      expect(plans[0].content_id).toBe('tc1');
    });

    test('both sides: source wins when it has more completed days', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);

      await seedPlanProgress(10, 'src', { completed_days: '[1,2,3]' });
      await seedPlanProgress(10, 'tgt', { completed_days: '[1]' });

      await seedUserLearningPlan(10, 'src', 1, 'sc1');
      await seedUserLearningPlan(10, 'src', 2, 'sc2');
      await seedUserLearningPlan(10, 'src', 3, 'sc3');
      await seedUserLearningPlan(10, 'tgt', 1, 'tc1');
      await seedUserLearningPlan(10, 'tgt', 2, 'tc2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 10 ORDER BY day_number");
      expect(plans.length).toBe(3);
      // Source plan won
      expect(plans[0].content_id).toBe('sc1');
      expect(plans[1].content_id).toBe('sc2');
      expect(plans[2].content_id).toBe('sc3');
    });

    test('both sides: target wins on tie (same completed day count)', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);

      await seedPlanProgress(10, 'src', { completed_days: '[1,2]' });
      await seedPlanProgress(10, 'tgt', { completed_days: '[3,4]' });

      await seedUserLearningPlan(10, 'src', 1, 'sc1');
      await seedUserLearningPlan(10, 'src', 2, 'sc2');
      await seedUserLearningPlan(10, 'tgt', 1, 'tc1');
      await seedUserLearningPlan(10, 'tgt', 2, 'tc2');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 10 ORDER BY day_number");
      expect(plans.length).toBe(2);
      // Target plan won (tie-breaker)
      expect(plans[0].content_id).toBe('tc1');
      expect(plans[1].content_id).toBe('tc2');

      const srcPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'src'");
      expect(srcPlans.length).toBe(0);
    });

    test('progress is still unioned even when premium winner-pick deletes loser plan', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);

      await seedPlanProgress(10, 'src', { completed_days: '[1,2,3]', enrolled_at: '2025-01-01' });
      await seedPlanProgress(10, 'tgt', { completed_days: '[4,5]', enrolled_at: '2025-02-01' });

      await seedUserLearningPlan(10, 'src', 1, 'sc1');
      await seedUserLearningPlan(10, 'tgt', 1, 'tc1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      // Progress should be unioned regardless of winner-pick
      const progress = await db.query("SELECT * FROM user_plan_progress WHERE skill_id = 'tgt' AND user_id = 10");
      expect(progress.length).toBe(1);
      expect(JSON.parse(progress[0].completed_days)).toEqual([1, 2, 3, 4, 5]);
    });

    test('free user in same merge still uses smart content-family merge', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedPremiumUser(10);
      await seedUser(20); // free user

      // Shared plan for realignment
      await seedContent('shared-c1', 'tgt');
      await seedLearningPlan('tgt', 1, 'shared-c1');

      // Premium user: both sides
      await seedPlanProgress(10, 'src', { completed_days: '[1]' });
      await seedPlanProgress(10, 'tgt', { completed_days: '[]' });
      await seedUserLearningPlan(10, 'src', 1, 'premium-sc1');
      await seedUserLearningPlan(10, 'tgt', 1, 'premium-tc1');

      // Free user: source-only
      await seedUserLearningPlan(20, 'src', 1, 'free-sc1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      // Premium user: source wins (1 completed vs 0)
      const premiumPlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 10");
      expect(premiumPlans.length).toBe(1);
      expect(premiumPlans[0].content_id).toBe('premium-sc1');

      // Free user: smart merge realigns to shared plan
      const freePlans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 20");
      expect(freePlans.length).toBeGreaterThanOrEqual(1);
      const day1 = freePlans.find(r => r.day_number === 1);
      expect(day1.content_id).toBe('shared-c1'); // realigned to shared plan
    });
  });

  // ── Premium plan days merge ────────────────────────────────────────

  describe('premium_plan_days merge', () => {
    test('source-only premium_plan_days repoint to target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedPremiumPlanDay(1, 'src', 1, { content_id: 'c1' });
      await seedPremiumPlanDay(1, 'src', 2, { content_id: 'c2' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const days = await db.query("SELECT * FROM premium_plan_days WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      expect(days.length).toBe(2);
      expect(days[0].content_id).toBe('c1');
      expect(days[1].content_id).toBe('c2');

      const srcDays = await db.query("SELECT * FROM premium_plan_days WHERE skill_id = 'src'");
      expect(srcDays.length).toBe(0);
    });

    test('target wins on conflict for same (user_id, day_number)', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      // Conflict on day 1, no conflict on day 2
      await seedPremiumPlanDay(1, 'src', 1, { content_id: 'src-c1', reason: 'from source' });
      await seedPremiumPlanDay(1, 'src', 2, { content_id: 'src-c2', reason: 'source only' });
      await seedPremiumPlanDay(1, 'tgt', 1, { content_id: 'tgt-c1', reason: 'from target' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const days = await db.query("SELECT * FROM premium_plan_days WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      expect(days.length).toBe(2);
      // Day 1: target wins
      expect(days[0].content_id).toBe('tgt-c1');
      expect(days[0].reason).toBe('from target');
      // Day 2: source moved
      expect(days[1].content_id).toBe('src-c2');
      expect(days[1].reason).toBe('source only');

      const srcDays = await db.query("SELECT * FROM premium_plan_days WHERE skill_id = 'src'");
      expect(srcDays.length).toBe(0);
    });
  });

  // ── plan_jobs, plan_review_content, review_submissions merge ───────

  describe('plan_jobs repointing in safeMerge', () => {
    test('merge: plan_jobs repoint from source to target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedPlanJob('src', 1, { job_type: 'review_content', day_number: 1 });
      await seedPlanJob('src', 1, { job_type: 'premium_plan_generation', day_number: 2 });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const srcJobs = await db.query("SELECT * FROM plan_jobs WHERE skill_id = 'src'");
      expect(srcJobs.length).toBe(0);

      const tgtJobs = await db.query("SELECT * FROM plan_jobs WHERE skill_id = 'tgt' ORDER BY day_number");
      expect(tgtJobs.length).toBe(2);
      expect(tgtJobs[0].job_type).toBe('review_content');
      expect(tgtJobs[1].job_type).toBe('premium_plan_generation');
    });

    test('rename: plan_jobs repoint from source to target', async () => {
      await seedSkill('src', 'Source');
      await seedUser(1);
      await seedPlanJob('src', 1, { job_type: 'review_content', day_number: 5 });

      await skillMergeService.safeMerge('src', 'new-tgt', { dryRun: false });

      const tgtJobs = await db.query("SELECT * FROM plan_jobs WHERE skill_id = 'new-tgt'");
      expect(tgtJobs.length).toBe(1);
      expect(tgtJobs[0].day_number).toBe(5);
    });
  });

  describe('plan_review_content repointing in safeMerge', () => {
    test('merge: plan_review_content repoint from source to target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedPlanReviewContent('src', 1, 7, { title: 'Week 1 Review' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const srcContent = await db.query("SELECT * FROM plan_review_content WHERE skill_id = 'src'");
      expect(srcContent.length).toBe(0);

      const tgtContent = await db.query("SELECT * FROM plan_review_content WHERE skill_id = 'tgt'");
      expect(tgtContent.length).toBe(1);
      expect(tgtContent[0].title).toBe('Week 1 Review');
    });
  });

  describe('review_submissions merge in safeMerge', () => {
    test('source-only submissions repoint to target', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      const subId = await seedReviewSubmission(1, 'src', 7, { result_summary: 'good', reflection: 'learned a lot' });
      await seedReviewSubmissionAnswer(subId, 'check1', { question: 'What did you learn?', answer: 'Everything' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const srcSubs = await db.query("SELECT * FROM review_submissions WHERE skill_id = 'src'");
      expect(srcSubs.length).toBe(0);

      const tgtSubs = await db.query("SELECT * FROM review_submissions WHERE skill_id = 'tgt'");
      expect(tgtSubs.length).toBe(1);
      expect(tgtSubs[0].result_summary).toBe('good');
      expect(tgtSubs[0].reflection).toBe('learned a lot');

      // Answers should still be attached via submission_id
      const answers = await db.query("SELECT * FROM review_submission_answers WHERE submission_id = ?", [tgtSubs[0].id]);
      expect(answers.length).toBe(1);
      expect(answers[0].answer).toBe('Everything');
    });

    test('target wins on review_submissions conflict (same user_id + day_number)', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      // Both have submissions for day 7
      const srcSubId = await seedReviewSubmission(1, 'src', 7, { result_summary: 'src result' });
      await seedReviewSubmissionAnswer(srcSubId, 'check1', { answer: 'src answer' });
      const tgtSubId = await seedReviewSubmission(1, 'tgt', 7, { result_summary: 'tgt result' });
      await seedReviewSubmissionAnswer(tgtSubId, 'check1', { answer: 'tgt answer' });

      // Source has non-conflicting submission too
      const srcSub2Id = await seedReviewSubmission(1, 'src', 14, { result_summary: 'src day 14' });
      await seedReviewSubmissionAnswer(srcSub2Id, 'check2', { answer: 'day 14 answer' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const tgtSubs = await db.query("SELECT * FROM review_submissions WHERE skill_id = 'tgt' ORDER BY day_number");
      expect(tgtSubs.length).toBe(2);
      // Day 7: target wins
      expect(tgtSubs[0].result_summary).toBe('tgt result');
      // Day 14: source moved
      expect(tgtSubs[1].result_summary).toBe('src day 14');

      // Source conflict answers should be deleted
      const srcAnswers = await db.query("SELECT * FROM review_submission_answers WHERE submission_id = ?", [srcSubId]);
      expect(srcAnswers.length).toBe(0);

      // Target answers preserved
      const tgtAnswers = await db.query("SELECT * FROM review_submission_answers WHERE submission_id = ?", [tgtSubId]);
      expect(tgtAnswers.length).toBe(1);
      expect(tgtAnswers[0].answer).toBe('tgt answer');
    });
  });

  // ── Review day preservation (bug fix regression) ───────────────────

  describe('review-day field preservation in user_learning_plans merge', () => {
    test('review_status, review_title, review_body are preserved for immutable completed review days', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      const reviewBody = JSON.stringify({ checks: [{ id: 'c1', question: 'Q?' }] });

      // Target user plan with a review day on day 7
      await seedUserLearningPlanWithReview(1, 'tgt', 7, null, {
        content_type: 'review',
        review_status: 'ready',
        review_title: 'Week 1 Check-in',
        review_body: reviewBody,
      });
      // Also a regular day
      await seedUserLearningPlanWithReview(1, 'tgt', 1, 'tc1');

      // Day 7 is completed
      await seedPlanProgress(1, 'tgt', { completed_days: '[7]' });

      // Source plans
      await seedUserLearningPlan(1, 'src', 1, 'sc1');

      // Shared plan (to trigger realignment)
      await seedLearningPlan('tgt', 1, 'shared-c1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      const day7 = plans.find(r => r.day_number === 7);
      expect(day7).toBeTruthy();
      expect(day7.content_type).toBe('review');
      expect(day7.review_status).toBe('ready');
      expect(day7.review_title).toBe('Week 1 Check-in');
      expect(day7.review_body).toBe(reviewBody);
    });

    test('review fields from source are preserved when source-only user plans are merged', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      const reviewBody = JSON.stringify({ checks: [{ id: 'c1', question: 'What did you learn?' }] });

      // Source plan with review day on day 7
      await seedUserLearningPlanWithReview(1, 'src', 7, null, {
        content_type: 'review',
        review_status: 'ready',
        review_title: 'Source Review',
        review_body: reviewBody,
      });
      await seedUserLearningPlan(1, 'src', 1, 'sc1');
      await seedPlanProgress(1, 'src', { completed_days: '[7]' });

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      const day7 = plans.find(r => r.day_number === 7);
      expect(day7).toBeTruthy();
      expect(day7.content_type).toBe('review');
      expect(day7.review_status).toBe('ready');
      expect(day7.review_title).toBe('Source Review');
      expect(day7.review_body).toBe(reviewBody);
    });

    test('non-completed review days realign but preserve review fields from shared plan', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);

      const reviewBody = JSON.stringify({ checks: [{ id: 'c1', question: 'Review Q' }] });

      // Shared plan has review day 7
      await db.insert(
        `INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['tgt', 7, null, 'review', null, 'ready', 'Shared Review', reviewBody]
      );

      // User has target plan with day 7 as non-review (not completed)
      await seedUserLearningPlan(1, 'tgt', 7, 'old-content');
      await seedPlanProgress(1, 'tgt', { completed_days: '[]' });

      // Source plan
      await seedUserLearningPlan(1, 'src', 1, 'sc1');

      await skillMergeService.safeMerge('src', 'tgt', { dryRun: false });

      const plans = await db.query("SELECT * FROM user_learning_plans WHERE skill_id = 'tgt' AND user_id = 1 ORDER BY day_number");
      const day7 = plans.find(r => r.day_number === 7);
      expect(day7).toBeTruthy();
      // Should realign to shared plan review fields
      expect(day7.content_type).toBe('review');
      expect(day7.review_title).toBe('Shared Review');
      expect(day7.review_body).toBe(reviewBody);
    });
  });

  // ── Impact report includes new tables ──────────────────────────────

  describe('dry-run impact report includes new tables', () => {
    test('reports plan_jobs, plan_review_content, review_submissions, premium_plan_days counts', async () => {
      await seedSkill('src', 'Source');
      await seedSkill('tgt', 'Target');
      await seedUser(1);
      await seedPlanJob('src', 1);
      await seedPlanReviewContent('src', 1, 7);
      await seedReviewSubmission(1, 'src', 7);
      await seedReviewSubmission(1, 'tgt', 7); // conflict
      await seedPremiumPlanDay(1, 'src', 1, { content_id: 'c1' });
      await seedPremiumPlanDay(1, 'src', 2, { content_id: 'c2' });
      await seedPremiumPlanDay(1, 'tgt', 1, { content_id: 'c3' }); // conflict

      const result = await skillMergeService.safeMerge('src', 'tgt', { dryRun: true });

      expect(result.impact.plan_jobs.source_count).toBe(1);
      expect(result.impact.plan_review_content.source_count).toBe(1);
      expect(result.impact.review_submissions.source_count).toBe(1);
      expect(result.impact.review_submissions.conflicts).toBe(1);
      expect(result.impact.review_submissions.will_move).toBe(0);
      expect(result.impact.premium_plan_days.source_count).toBe(2);
      expect(result.impact.premium_plan_days.conflicts).toBe(1);
      expect(result.impact.premium_plan_days.will_move).toBe(1);
    });
  });
});
