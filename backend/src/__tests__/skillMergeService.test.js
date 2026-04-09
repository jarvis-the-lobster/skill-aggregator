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
});
