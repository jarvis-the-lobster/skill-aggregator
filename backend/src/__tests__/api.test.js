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

const scraperService = require('../services/scraperService');
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

describe('GET/POST /api/admin/review-jobs', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('lists pending review jobs when authorized with CRON_SECRET', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
      payload: { focus: 'recap' },
      plan_created_at: '2026-04-11 12:00:00',
    });
    await db.createPlanJob({
      skill_id: 'python',
      job_type: 'different_job',
      day_number: 8,
    });

    const res = await request(app)
      .get('/api/admin/review-jobs')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.jobs[0]).toMatchObject({
      skillId: 'python',
      dayNumber: 7,
      status: 'pending',
      payload: { focus: 'recap' },
    });
  });

  test('processes a review job, saves content, and marks it complete', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 14,
      plan_created_at: '2026-04-11 12:00:00',
    });

    const payload = {
      summary: 'You covered loops and functions.',
      content_covered: [{ day: 8, type: 'video', title: 'Python loops' }],
      knowledge_checks: [
        {
          question: 'What is the difference between a for loop and a while loop?',
          topic: 'loops',
          helper_text: 'Answer in plain English.',
          expected_points: ['for loops iterate over a sequence', 'while loops run until a condition changes'],
          placeholder: 'Describe the difference',
        },
      ],
      reflection_prompts: ['What still feels fuzzy after this week?'],
    };

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({
        title: 'Week 2 check-in',
        body: payload,
        reviewType: 'weekly_checkin',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      jobId: insertResult.id,
      status: 'completed',
      skillId: 'python',
      dayNumber: 14,
    });

    const storedReview = await db.getReviewContent('python', 14, null);
    expect(storedReview).toBeTruthy();
    expect(storedReview.title).toBe('Week 2 check-in');
    expect(JSON.parse(storedReview.body)).toEqual(payload);

    const [jobRow] = await db.query('SELECT status, completed_at FROM plan_jobs WHERE id = ?', [insertResult.id]);
    expect(jobRow.status).toBe('completed');
    expect(jobRow.completed_at).toBeTruthy();
  });

  test('rejects processing when required content fields are missing', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 21,
    });

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ body: { summary: 'Missing title should fail.' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title is required/i);

    const [jobRow] = await db.query('SELECT status, error_message FROM plan_jobs WHERE id = ?', [insertResult.id]);
    expect(jobRow.status).toBe('pending');
    expect(jobRow.error_message).toMatch(/title is required/i);
  });

  test('rejects review payloads without structured knowledge checks', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
    });

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({
        title: 'Week 1 check-in',
        body: {
          summary: 'Reflection only is not enough.',
          content_covered: [{ day: 1, type: 'video', title: 'Intro' }],
          reflection_prompts: ['What felt easy this week?'],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/knowledge_checks must be a non-empty array/i);

    const storedReview = await db.getReviewContent('python', 7, null);
    expect(storedReview).toBeNull();

    const [jobRow] = await db.query('SELECT status, error_message FROM plan_jobs WHERE id = ?', [insertResult.id]);
    expect(jobRow.status).toBe('pending');
    expect(jobRow.error_message).toMatch(/knowledge_checks must be a non-empty array/i);
  });

  test('accepts multiple_choice knowledge checks with valid options', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
      plan_created_at: '2026-04-11 12:00:00',
    });

    const payload = {
      summary: 'You covered variables and assignment.',
      content_covered: [{ day: 1, type: 'video', title: 'Python variables' }],
      knowledge_checks: [
        {
          type: 'multiple_choice',
          question: 'Which keyword declares a variable in Python?',
          topic: 'variables-and-assignment',
          options: ['var', 'let', 'Neither — just assign it', 'const'],
          correct_option: 2,
          helper_text: 'Think about how Python differs from JavaScript.',
        },
      ],
      reflection_prompts: ['What clicked this week?'],
    };

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ title: 'Week 1 check-in', body: payload, reviewType: 'weekly_checkin' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const storedReview = await db.getReviewContent('python', 7, null);
    expect(JSON.parse(storedReview.body).knowledge_checks[0].options).toEqual([
      'var', 'let', 'Neither — just assign it', 'const',
    ]);
  });

  test('rejects knowledge checks with fewer than 2 options', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
      plan_created_at: '2026-04-11 12:00:00',
    });

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({
        title: 'Week 1 check-in',
        body: {
          summary: 'Test.',
          content_covered: [{ day: 1, type: 'video', title: 'Python variables' }],
          reflection_prompts: ['reflect'],
          knowledge_checks: [
            {
              type: 'multiple_choice',
              question: 'Pick one',
              topic: 'basics',
              options: ['Only one option'],
            },
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/options must be an array of at least 2/i);
  });

  test('rejects multiple_choice without correct_option', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
      plan_created_at: '2026-04-11 12:00:00',
    });

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({
        title: 'Week 1 check-in',
        body: {
          summary: 'Test.',
          content_covered: [{ day: 1, type: 'video', title: 'Python variables' }],
          reflection_prompts: ['reflect'],
          knowledge_checks: [
            {
              type: 'multiple_choice',
              question: 'Pick one',
              topic: 'basics',
              options: ['A', 'B'],
            },
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/correct_option/i);
  });

  test('rejects correct_option that does not match any option', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    const insertResult = await db.createPlanJob({
      skill_id: 'python',
      job_type: 'review_content',
      day_number: 7,
      plan_created_at: '2026-04-11 12:00:00',
    });

    const res = await request(app)
      .post(`/api/admin/review-jobs/${insertResult.id}/process`)
      .set('Authorization', 'Bearer test-cron-secret')
      .send({
        title: 'Week 1 check-in',
        body: {
          summary: 'Test.',
          content_covered: [{ day: 1, type: 'video', title: 'Python variables' }],
          reflection_prompts: ['reflect'],
          knowledge_checks: [
            {
              type: 'multiple_choice',
              question: 'Pick one',
              topic: 'basics',
              options: ['A', 'B'],
              correct_option: 5,
            },
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/correct_option must be an integer index/i);
  });

  describe('review body schema rigidity', () => {
    async function setupJob() {
      await db.insert("INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')");
      return db.createPlanJob({ skill_id: 'python', job_type: 'review_content', day_number: 7 });
    }

    const baseValidBody = () => ({
      summary: 'Week 1 summary',
      content_covered: [{ day: 1, type: 'video', title: 'Intro to Python' }],
      reflection_prompts: ['What clicked?'],
      knowledge_checks: [
        {
          id: 'kc-1',
          type: 'multiple_choice',
          question: 'Q?',
          topic: 'variables',
          options: ['A', 'B'],
          correct_option: 0,
        },
      ],
    });

    async function post(jobId, body) {
      return request(app)
        .post(`/api/admin/review-jobs/${jobId}/process`)
        .set('Authorization', 'Bearer test-cron-secret')
        .send({ title: 'Week 1', body, reviewType: 'weekly_checkin' });
    }

    test('accepts a fully-formed review body', async () => {
      const job = await setupJob();
      const res = await post(job.id, baseValidBody());
      expect(res.status).toBe(200);
    });

    test('rejects body missing summary', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      delete body.summary;
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/summary/i);
    });

    test('rejects body missing content_covered', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      delete body.content_covered;
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content_covered/i);
    });

    test('rejects content_covered entry missing day', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.content_covered = [{ type: 'video', title: 'Intro' }];
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content_covered\.day/i);
    });

    test('rejects content_covered entry missing title', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.content_covered = [{ day: 1, type: 'video' }];
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content_covered\.title/i);
    });

    test('rejects content_covered entry missing type', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.content_covered = [{ day: 1, title: 'Intro' }];
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/content_covered\.type/i);
    });

    test('accepts body without reflection_prompts', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      delete body.reflection_prompts;
      const res = await post(job.id, body);
      expect(res.status).toBe(200);
    });

    test('rejects reflection_prompts with non-string entries', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.reflection_prompts = ['valid', 42];
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reflection_prompts/i);
    });

    test('rejects knowledge_check missing topic', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      delete body.knowledge_checks[0].topic;
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/topic/i);
    });

    test('rejects multiple_choice correct_option as a string', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.knowledge_checks[0].correct_option = 'A';
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/integer index/i);
    });

    test('rejects multiple_choice correct_option out of range', async () => {
      const job = await setupJob();
      const body = baseValidBody();
      body.knowledge_checks[0].correct_option = 99;
      const res = await post(job.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/integer index/i);
    });

    test('db.saveReviewContent throws on invalid body', async () => {
      await expect(
        db.saveReviewContent({
          skill_id: 'python',
          day_number: 7,
          review_type: 'weekly_checkin',
          title: 'Week 1',
          body: { summary: 'missing everything else' },
        })
      ).rejects.toThrow(/Invalid review body/);
    });

    test('db.saveSharedReviewContent throws on invalid body', async () => {
      await db.insert("INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')");
      await db.insert(
        "INSERT INTO learning_plans (skill_id, day_number, content_type, review_status) VALUES ('python', 7, 'review', 'pending')"
      );
      await expect(
        db.saveSharedReviewContent({
          skill_id: 'python',
          day_number: 7,
          review_type: 'weekly_checkin',
          title: 'Week 1',
          body: { knowledge_checks: [] },
        })
      ).rejects.toThrow(/Invalid review body/);
    });
  });
});

describe('GET /api/learning-plans/:skillId — answer key sanitization', () => {
  test('does not expose correct_option in reviewContent', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );

    const reviewBody = JSON.stringify({
      summary: 'Week 1 recap',
      content_covered: [{ day: 1, type: 'video', title: 'Intro to Python' }],
      knowledge_checks: [
        { id: 'kc-1', type: 'multiple_choice', question: 'What is Python?', topic: 'intro', options: ['A language', 'A snake'], correct_option: 0 },
      ],
      reflection_prompts: ['What clicked this week?'],
    });

    await db.insert(
      "INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, review_status, review_title, review_body) VALUES (?, 7, NULL, 'review', 'ready', 'Week 1', ?)",
      ['python', reviewBody]
    );

    const res = await request(app).get('/api/learning-plans/python');

    expect(res.status).toBe(200);
    const rc = res.body.reviewContent;
    expect(rc).toBeDefined();
    expect(rc['7']).toBeDefined();
    const checks = rc['7'].body.knowledge_checks;
    expect(checks[0].options).toBeDefined();
    expect(checks[0].correct_option).toBeUndefined();
  });
});

describe('POST /api/learning-plans/:skillId/review/:dayNumber/submit', () => {
  async function setupEnrolledUser() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'reviewer@example.com', password: 'password123' });
    const token = res.body.token;
    const userId = res.body.user.id;

    await db.insert("INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')");
    await db.enrollPlan(userId, 'python');

    const reviewBody = {
      summary: 'Week 1 recap',
      content_covered: [
        { day: 1, type: 'video', title: 'Intro to Python' },
        { day: 2, type: 'video', title: 'Intro to Python' },
      ],
      knowledge_checks: [
        { id: 'kc-1', type: 'multiple_choice', question: 'What is Python?', topic: 'python-intro', options: ['A language', 'A snake', 'A framework'], correct_option: 0 },
        { id: 'kc-2', type: 'short_answer', question: 'Explain variables', topic: 'variables', placeholder: 'Your answer' },
      ],
      reflection_prompts: ['What clicked this week?'],
    };
    await db.saveReviewContent({
      skill_id: 'python', user_id: null, day_number: 7,
      review_type: 'weekly_checkin', title: 'Week 1 check-in',
      body: reviewBody, plan_created_at: null,
    });

    return { token, userId };
  }

  test('free user: stores submission with result summary', async () => {
    const { token } = await setupEnrolledUser();

    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { check_id: 'kc-1', question: 'What is Python?', check_type: 'multiple_choice', answer: 'A language' },
          { check_id: 'kc-2', question: 'Explain variables', check_type: 'short_answer', answer: 'They store data' },
        ],
        reflection: 'Variables make sense now.',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('completed');
    expect(res.body.result.multiple_choice).toEqual({ total: 1, correct: 1 });
    expect(res.body.result.missed).toEqual([]);

    const submissionRows = await db.query('SELECT * FROM review_submissions WHERE id = ?', [res.body.submissionId]);
    expect(submissionRows).toHaveLength(1);
    expect(submissionRows[0].status).toBe('completed');
    expect(submissionRows[0].reflection).toBe('Variables make sense now.');

    const storedAnswers = await db.getReviewSubmissionAnswers(res.body.submissionId);
    expect(storedAnswers).toHaveLength(2);
    expect(storedAnswers[0].correct).toBe(1);
    expect(storedAnswers[1].correct).toBeNull();
  });

  test('free user: missed MC questions appear in result', async () => {
    const { token } = await setupEnrolledUser();

    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { check_id: 'kc-1', question: 'What is Python?', check_type: 'multiple_choice', answer: 'A snake' },
          { check_id: 'kc-2', question: 'Explain variables', check_type: 'short_answer', answer: 'Not sure' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.result.multiple_choice).toEqual({ total: 1, correct: 0 });
    expect(res.body.result.missed).toHaveLength(1);
    expect(res.body.result.missed[0].check_id).toBe('kc-1');
  });

  test('premium user: stores submission as pending without result summary', async () => {
    const { token, userId } = await setupEnrolledUser();
    await db.insert("UPDATE users SET plan_tier = 'premium', subscription_status = 'active' WHERE id = ?", [userId]);

    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { check_id: 'kc-1', question: 'What is Python?', check_type: 'multiple_choice', answer: 'A language' },
          { check_id: 'kc-2', question: 'Explain variables', check_type: 'short_answer', answer: 'They hold values' },
        ],
        reflection: 'Feeling good.',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('pending');
    expect(res.body.result).toBeUndefined();

    const submissionRow = await db.query('SELECT * FROM review_submissions WHERE id = ?', [res.body.submissionId]);
    expect(submissionRow[0].status).toBe('pending');
    expect(submissionRow[0].result_summary).toBeNull();
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .send({ answers: [{ check_id: 'kc-1', question: 'Q', answer: 'A' }] });

    expect(res.status).toBe(401);
  });

  test('rejects empty answers array', async () => {
    const { token } = await setupEnrolledUser();

    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty array/i);
  });

  test('free user: scores using correct_option index, not a string match', async () => {
    const { token } = await setupEnrolledUser();

    const res = await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { check_id: 'kc-1', question: 'What is Python?', check_type: 'multiple_choice', answer: 'A language' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.result.multiple_choice).toEqual({ total: 1, correct: 1 });
  });

  test('notification after missed answers references topics and days', async () => {
    const { token, userId } = await setupEnrolledUser();

    await request(app)
      .post('/api/learning-plans/python/review/7/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { check_id: 'kc-1', question: 'What is Python?', check_type: 'multiple_choice', answer: 'A snake' },
        ],
      });

    const notifications = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'review_result'",
      [userId]
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toMatch(/Review Day 7: 0\/1/);
    expect(notifications[0].body).toMatch(/python intro/);
    expect(notifications[0].body).not.toMatch(/python-intro/);
    expect(notifications[0].body).toMatch(/Days? 1/);
    const payload = JSON.parse(notifications[0].data);
    expect(payload.result.missed_topics).toContain('python-intro');
    expect(payload.result.content_to_review).toEqual([
      { day: 1, type: 'video', title: 'Intro to Python' },
      { day: 2, type: 'video', title: 'Intro to Python' },
    ]);
  });

  test('rejects unenrolled user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'outsider@example.com', password: 'password123' });

    await db.insert("INSERT INTO skills (id, name, status) VALUES ('javascript', 'JavaScript', 'ready')");

    const submitRes = await request(app)
      .post('/api/learning-plans/javascript/review/7/submit')
      .set('Authorization', `Bearer ${res.body.token}`)
      .send({ answers: [{ check_id: 'kc-1', question: 'Q', answer: 'A' }] });

    expect(submitRes.status).toBe(403);
    expect(submitRes.body.error).toMatch(/not enrolled/i);
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

describe('scrapeArticles freeCodeCamp category gating', () => {
  beforeEach(() => {
    scraperService.scrapeDevTo.mockResolvedValue([]);
    scraperService.scrapeMediumRSS.mockResolvedValue([]);
    scraperService.scrapeFreeCodeCamp.mockResolvedValue([]);
  });

  test('skips freeCodeCamp for uncategorized or unsupported skills', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('reddit-marketing', 'Reddit Marketing', 'marketing', 'ready')"
    );

    const articles = await scraperService.scrapeArticles('reddit-marketing');
    expect(articles).toEqual([]);
    expect(scraperService.scrapeFreeCodeCamp).not.toHaveBeenCalled();

    const logs = await db.query(
      "SELECT source, status, error_message FROM scrape_log WHERE skill_id = 'reddit-marketing' ORDER BY id"
    );
    const fccLog = logs.find((row) => row.source === 'freecodecamp');
    expect(fccLog).toBeDefined();
    expect(fccLog.status).toBe('skipped');
    expect(fccLog.error_message).toMatch(/not eligible/i);
  });

  test('skips freeCodeCamp when category is null', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('mystery-skill', 'Mystery Skill', NULL, 'ready')"
    );

    const articles = await scraperService.scrapeArticles('mystery-skill');
    expect(articles).toEqual([]);
    expect(scraperService.scrapeFreeCodeCamp).not.toHaveBeenCalled();

    const logs = await db.query(
      "SELECT source, status, error_message FROM scrape_log WHERE skill_id = 'mystery-skill' AND source = 'freecodecamp' ORDER BY id DESC LIMIT 1"
    );
    expect(logs[0].status).toBe('skipped');
    expect(logs[0].error_message).toMatch(/uncategorized/i);
  });

  test('runs freeCodeCamp for supported categories', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('python', 'Python', 'programming', 'ready')"
    );
    scraperService.scrapeFreeCodeCamp.mockResolvedValue([
      {
        id: 'fcc_python_1',
        title: 'Learn Python',
        url: 'https://www.freecodecamp.org/news/python',
        source: 'freeCodeCamp',
        author: 'freeCodeCamp',
        excerpt: 'Python article',
        tags: ['python']
      }
    ]);

    const articles = await scraperService.scrapeArticles('python');
    expect(scraperService.scrapeFreeCodeCamp).toHaveBeenCalledWith('python');
    expect(articles).toHaveLength(1);

    const logs = await db.query(
      "SELECT source, status, items_fetched FROM scrape_log WHERE skill_id = 'python' AND source = 'freecodecamp' ORDER BY id DESC LIMIT 1"
    );
    expect(logs[0].status).toBe('success');
    expect(logs[0].items_fetched).toBe(1);
  });
});

describe('GET /api/admin/metrics skill health status', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('marks skills with content plus latest relevant source errors as partial, not error', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('python', 'Python', 'programming', 'ready')"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source) VALUES ('a1', 'python', 'article', 'Python Guide', 'https://example.com/a1', 'devto')"
    );
    await db.logScrape({ skill_id: 'python', source: 'devto', status: 'success', items_fetched: 1 });
    await db.logScrape({ skill_id: 'python', source: 'freecodecamp', status: 'error', error_message: '404' });

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    const skill = res.body.skillHealth.find((row) => row.skill_id === 'python');
    expect(skill).toBeDefined();
    expect(skill.content_count).toBe(1);
    expect(skill.last_scrape_status).toBe('partial');
  });

  test('ignores old source errors when a newer skip supersedes them', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('reddit-marketing', 'Reddit Marketing', 'marketing', 'ready')"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source) VALUES ('a1', 'reddit-marketing', 'article', 'Reddit Guide', 'https://example.com/a1', 'devto')"
    );
    await db.logScrape({ skill_id: 'reddit-marketing', source: 'devto', status: 'success', items_fetched: 1 });
    await db.logScrape({ skill_id: 'reddit-marketing', source: 'freecodecamp', status: 'error', error_message: 'old 404' });
    await db.logScrape({ skill_id: 'reddit-marketing', source: 'freecodecamp', status: 'skipped', error_message: 'category not eligible' });

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    const skill = res.body.skillHealth.find((row) => row.skill_id === 'reddit-marketing');
    expect(skill).toBeDefined();
    expect(skill.content_count).toBe(1);
    expect(skill.last_scrape_status).toBe('success');
  });

  test('marks skills with no content and latest relevant scrape errors as error', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, category, status) VALUES ('broken-skill', 'Broken Skill', 'programming', 'ready')"
    );
    await db.logScrape({ skill_id: 'broken-skill', source: 'freecodecamp', status: 'error', error_message: '404' });

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    const skill = res.body.skillHealth.find((row) => row.skill_id === 'broken-skill');
    expect(skill).toBeDefined();
    expect(skill.content_count).toBe(0);
    expect(skill.last_scrape_status).toBe('error');
  });
});

describe('GET /api/admin/metrics youtube quota window', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('counts youtube quota within the current Pacific day window', async () => {
    await db.logScrape({ skill_id: 'python', source: 'youtube', status: 'success', quota_used: 120 });
    await db.logScrape({ skill_id: 'javascript', source: 'youtube', status: 'success', quota_used: 240 });
    await db.insert(
      "INSERT INTO scrape_log (skill_id, source, status, quota_used, scraped_at) VALUES ('old-skill', 'youtube', 'success', 999, '2000-01-01 12:00:00')"
    );

    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body.youtubeQuota.used).toBe(360);
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

describe('POST /api/admin/send-streak-reminders', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const pushService = require('../services/pushService');

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  })();

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    pushService.sendStreakReminder.mockClear();
    pushService.sendStreakReminder.mockResolvedValue({ sent: 1, failed: 0 });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  async function createUserWithStreak({ email, currentStreak, lastActivityDate, withPush = false }) {
    const user = await db.insert(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, 'hash']
    );
    await db.insert(
      'INSERT INTO user_streaks (user_id, current_streak, last_activity_date) VALUES (?, ?, ?)',
      [user.id, currentStreak, lastActivityDate]
    );
    if (withPush) {
      await db.insert(
        'INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?, ?)',
        [user.id, `https://push.example.com/${user.id}`, 'p256', 'auth']
      );
    }
    return user.id;
  }

  test('rejects unauthorized requests', async () => {
    const res = await request(app).post('/api/admin/send-streak-reminders');
    expect(res.status).toBe(401);
  });

  test('creates in-app notifications for all at-risk users regardless of push subscription', async () => {
    const pushUserId = await createUserWithStreak({
      email: 'push@example.com',
      currentStreak: 5,
      lastActivityDate: yesterday,
      withPush: true,
    });
    const noPushUserId = await createUserWithStreak({
      email: 'nopush@example.com',
      currentStreak: 3,
      lastActivityDate: yesterday,
      withPush: false,
    });

    const res = await request(app)
      .post('/api/admin/send-streak-reminders')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.usersTargeted).toBe(2);
    expect(res.body.inAppCreated).toBe(2);

    const pushUserNotifs = await db.getNotifications(pushUserId, { limit: 10, offset: 0 });
    const noPushUserNotifs = await db.getNotifications(noPushUserId, { limit: 10, offset: 0 });

    expect(pushUserNotifs).toHaveLength(1);
    expect(pushUserNotifs[0]).toMatchObject({
      type: 'streak_reminder',
      title: 'Your streak is at risk!',
    });
    expect(pushUserNotifs[0].body).toContain('5-day streak');

    expect(noPushUserNotifs).toHaveLength(1);
    expect(noPushUserNotifs[0]).toMatchObject({
      type: 'streak_reminder',
    });
    expect(noPushUserNotifs[0].body).toContain('3-day streak');
  });

  test('skips users who already completed today', async () => {
    const completedUserId = await createUserWithStreak({
      email: 'done@example.com',
      currentStreak: 10,
      lastActivityDate: today,
      withPush: true,
    });
    const atRiskUserId = await createUserWithStreak({
      email: 'atrisk@example.com',
      currentStreak: 2,
      lastActivityDate: yesterday,
      withPush: false,
    });

    const res = await request(app)
      .post('/api/admin/send-streak-reminders')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body.usersTargeted).toBe(1);
    expect(res.body.inAppCreated).toBe(1);

    const completedUserNotifs = await db.getNotifications(completedUserId, { limit: 10, offset: 0 });
    const atRiskUserNotifs = await db.getNotifications(atRiskUserId, { limit: 10, offset: 0 });

    expect(completedUserNotifs).toHaveLength(0);
    expect(atRiskUserNotifs).toHaveLength(1);
    expect(pushService.sendStreakReminder).not.toHaveBeenCalledWith(completedUserId, expect.anything());
  });

  test('sends push only to users with a push subscription', async () => {
    const pushUserId = await createUserWithStreak({
      email: 'push2@example.com',
      currentStreak: 4,
      lastActivityDate: yesterday,
      withPush: true,
    });
    const noPushUserId = await createUserWithStreak({
      email: 'nopush2@example.com',
      currentStreak: 6,
      lastActivityDate: yesterday,
      withPush: false,
    });

    const res = await request(app)
      .post('/api/admin/send-streak-reminders')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body.inAppCreated).toBe(2);
    expect(res.body.sent).toBe(1);

    expect(pushService.sendStreakReminder).toHaveBeenCalledTimes(1);
    expect(pushService.sendStreakReminder).toHaveBeenCalledWith(pushUserId, 4);
    expect(pushService.sendStreakReminder).not.toHaveBeenCalledWith(noPushUserId, expect.anything());
  });
});

describe('POST /api/admin/skills/:id/rename', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('moves personal, premium, review, and job data to the new skill id', async () => {
    await db.insert("INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')");
    await db.insert("INSERT INTO users (email, password_hash) VALUES ('rename@example.com', 'hash')");
    const [user] = await db.query("SELECT id FROM users WHERE email = 'rename@example.com'");

    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source) VALUES ('py-1', 'python', 'video', 'Python Basics', 'https://example.com/python', 'youtube')"
    );
    await db.insert(
      "INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason) VALUES ('python', 1, 'py-1', 'video', 'shared plan')"
    );
    await db.insert(
      "INSERT INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason) VALUES (?, 'python', 1, 'py-1', 'video', 'personal plan')",
      [user.id]
    );
    await db.insert(
      "INSERT INTO premium_plan_days (user_id, skill_id, day_number, content_id, content_type, reason, status) VALUES (?, 'python', 8, 'py-1', 'video', 'premium plan', 'pending_merge')",
      [user.id]
    );
    await db.saveReviewContent({
      skill_id: 'python',
      user_id: user.id,
      day_number: 7,
      review_type: 'weekly_checkin',
      title: 'Week 1',
      body: {
        summary: 'Review',
        content_covered: [{ day: 1, type: 'video', title: 'Python Basics' }],
        knowledge_checks: [
          {
            question: 'What is Python?',
            topic: 'basics',
            helper_text: 'Answer briefly.',
            expected_points: ['A programming language'],
            placeholder: 'Write your answer',
          },
        ],
        reflection_prompts: ['What still feels fuzzy?'],
      },
      plan_created_at: '2026-04-24T16:00:00Z',
    });
    await db.createReviewSubmission({
      user_id: user.id,
      skill_id: 'python',
      day_number: 7,
      status: 'completed',
      result_summary: JSON.stringify({ ok: true }),
      reflection: 'solid',
    });
    await db.createPlanJob({
      skill_id: 'python',
      user_id: user.id,
      job_type: 'premium_plan_generation',
      day_number: 7,
      payload: { triggerDay: 7 },
      plan_created_at: '2026-04-24T16:00:00Z',
    });
    await db.insert(
      "INSERT INTO user_plan_progress (user_id, skill_id, completed_days) VALUES (?, 'python', '[]')",
      [user.id]
    );
    await db.insert(
      "INSERT INTO user_courses (user_id, skill_id, enrolled_at) VALUES (?, 'python', CURRENT_TIMESTAMP)",
      [user.id]
    );
    await db.insert(
      "INSERT INTO scrape_log (skill_id, source, status, scraped_at) VALUES ('python', 'manual', 'success', CURRENT_TIMESTAMP)"
    );

    const res = await request(app)
      .post('/api/admin/skills/python/rename')
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ newId: 'python-advanced', newName: 'Python Advanced' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, renamed: 'python → python-advanced' });

    const tables = [
      'content',
      'learning_plans',
      'user_courses',
      'user_plan_progress',
      'scrape_log',
      'user_learning_plans',
      'premium_plan_days',
      'plan_jobs',
      'plan_review_content',
      'review_submissions',
    ];

    for (const table of tables) {
      const oldRows = await db.query(`SELECT COUNT(*) as count FROM ${table} WHERE skill_id = 'python'`);
      const newRows = await db.query(`SELECT COUNT(*) as count FROM ${table} WHERE skill_id = 'python-advanced'`);
      expect(oldRows[0].count).toBe(0);
      expect(newRows[0].count).toBeGreaterThan(0);
    }

    const [newSkill] = await db.query("SELECT id, name FROM skills WHERE id = 'python-advanced'");
    const [oldSkill] = await db.query("SELECT COUNT(*) as count FROM skills WHERE id = 'python'");
    expect(newSkill).toEqual({ id: 'python-advanced', name: 'Python Advanced' });
    expect(oldSkill.count).toBe(0);
  });
});

describe('DELETE /api/admin/skills/:id', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  test('deletes personal plans, premium plans, and review submissions for the skill', async () => {
    await db.insert("INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')");
    await db.insert("INSERT INTO users (email, password_hash) VALUES ('cleanup@example.com', 'hash')");
    const [user] = await db.query("SELECT id FROM users WHERE email = 'cleanup@example.com'");

    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source) VALUES ('py-1', 'python', 'video', 'Python Basics', 'https://example.com/python', 'youtube')"
    );
    await db.insert(
      "INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason) VALUES ('python', 1, 'py-1', 'video', 'shared plan')"
    );
    await db.insert(
      "INSERT INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason) VALUES (?, 'python', 1, 'py-1', 'video', 'personal plan')",
      [user.id]
    );
    await db.insert(
      "INSERT INTO premium_plan_days (user_id, skill_id, day_number, content_id, content_type, reason, status) VALUES (?, 'python', 8, 'py-1', 'video', 'premium plan', 'pending_merge')",
      [user.id]
    );
    await db.saveReviewContent({
      skill_id: 'python',
      user_id: user.id,
      day_number: 7,
      review_type: 'weekly_checkin',
      title: 'Week 1',
      body: {
        summary: 'Review',
        content_covered: [{ day: 1, type: 'video', title: 'Python Basics' }],
        knowledge_checks: [
          {
            question: 'What is Python?',
            topic: 'basics',
            helper_text: 'Answer briefly.',
            expected_points: ['A programming language'],
            placeholder: 'Write your answer',
          },
        ],
        reflection_prompts: ['What still feels fuzzy?'],
      },
      plan_created_at: '2026-04-24T16:00:00Z',
    });
    const submission = await db.createReviewSubmission({
      user_id: user.id,
      skill_id: 'python',
      day_number: 7,
      status: 'completed',
      result_summary: JSON.stringify({ ok: true }),
      reflection: 'solid',
    });
    await db.saveReviewSubmissionAnswers(submission.id, [
      {
        check_id: 'kc-1',
        question: 'What is Python?',
        check_type: 'short_answer',
        answer: 'A language',
        correct: null,
      },
    ]);
    await db.createPlanJob({
      skill_id: 'python',
      user_id: user.id,
      job_type: 'premium_plan_generation',
      day_number: 7,
      payload: { triggerDay: 7 },
      plan_created_at: '2026-04-24T16:00:00Z',
    });
    await db.insert(
      "INSERT INTO user_plan_progress (user_id, skill_id, completed_days) VALUES (?, 'python', '[]')",
      [user.id]
    );
    await db.insert(
      "INSERT INTO user_courses (user_id, skill_id, enrolled_at) VALUES (?, 'python', CURRENT_TIMESTAMP)",
      [user.id]
    );
    await db.insert(
      "INSERT INTO scrape_log (skill_id, source, status, scraped_at) VALUES ('python', 'manual', 'success', CURRENT_TIMESTAMP)"
    );

    const res = await request(app)
      .delete('/api/admin/skills/python')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: 'python' });

    const [skillCount] = await db.query("SELECT COUNT(*) as count FROM skills WHERE id = 'python'");
    const [userPlanCount] = await db.query("SELECT COUNT(*) as count FROM user_learning_plans WHERE skill_id = 'python'");
    const [premiumPlanCount] = await db.query("SELECT COUNT(*) as count FROM premium_plan_days WHERE skill_id = 'python'");
    const [reviewContentCount] = await db.query("SELECT COUNT(*) as count FROM plan_review_content WHERE skill_id = 'python'");
    const [reviewSubmissionCount] = await db.query("SELECT COUNT(*) as count FROM review_submissions WHERE skill_id = 'python'");
    const [reviewAnswerCount] = await db.query('SELECT COUNT(*) as count FROM review_submission_answers');

    expect(skillCount.count).toBe(0);
    expect(userPlanCount.count).toBe(0);
    expect(premiumPlanCount.count).toBe(0);
    expect(reviewContentCount.count).toBe(0);
    expect(reviewSubmissionCount.count).toBe(0);
    expect(reviewAnswerCount.count).toBe(0);
  });
});
