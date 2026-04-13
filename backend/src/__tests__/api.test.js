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
          options: ['var', 'let', 'Neither — just assign it', 'const'],
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
          knowledge_checks: [
            {
              type: 'multiple_choice',
              question: 'Pick one',
              options: ['Only one option'],
            },
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/options must be an array of at least 2/i);
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
