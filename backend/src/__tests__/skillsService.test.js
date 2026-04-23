const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);
jest.mock('../services/scraperService', () => ({
  scrapeSkill: jest.fn().mockResolvedValue({ videos: [], articles: [] }),
  scrapeArticles: jest.fn().mockResolvedValue([]),
}));

const skillsService = require('../services/skillsService');
const scraperService = require('../services/scraperService');

let db;

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  skillsService._newSkillCounts = new Map();
});

afterAll(async () => {
  await db.close();
});

// --- normalizeSkillId edge cases ---

describe('normalizeSkillId', () => {
  test('lowercases and slugifies', () => {
    expect(skillsService.normalizeSkillId('Machine Learning')).toBe('machine-learning');
  });

  test('handles C++', () => {
    expect(skillsService.normalizeSkillId('C++')).toBe('c-plus-plus');
  });

  test('handles C#', () => {
    expect(skillsService.normalizeSkillId('C#')).toBe('c-sharp');
  });

  test('handles .js suffix', () => {
    expect(skillsService.normalizeSkillId('Node.js')).toBe('nodejs');
  });

  test('handles .NET', () => {
    expect(skillsService.normalizeSkillId('.NET')).toBe('dotnet');
  });

  test('handles spaces and uppercase', () => {
    expect(skillsService.normalizeSkillId('  WEB   Development  ')).toBe('web-development');
  });

  test('strips special characters', () => {
    expect(skillsService.normalizeSkillId('React & Vue!')).toBe('react-vue');
  });
});

// --- searchSkill ---

describe('searchSkill', () => {
  test('returns content for existing ready skill', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python Programming', 'ready')"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source, duration, views) VALUES ('v1', 'python', 'video', 'Learn Python', 'https://example.com/v1', 'youtube', '15:00', 1000)"
    );

    const result = await skillsService.searchSkill('Python');
    expect(result.status).toBe('ready');
    expect(result.skill.id).toBe('python');
    expect(result.content.videos.length).toBe(1);
    expect(result.content.videos[0].title).toBe('Learn Python');
  });

  test('creates new skill for non-existent query and returns pending', async () => {
    const result = await skillsService.searchSkill('kubernetes');
    expect(['pending', 'scraping']).toContain(result.status);
    expect(result.skill.id).toBe('kubernetes');
    expect(result.message).toBeTruthy();
  });

  test('does not trigger full scrape for search misses', async () => {
    await skillsService.searchSkill('observability');
    expect(scraperService.scrapeSkill).not.toHaveBeenCalled();
    expect(scraperService.scrapeArticles).toHaveBeenCalled();
  });

  test('blocks inappropriate search terms', async () => {
    const result = await skillsService.searchSkill('porn');
    expect(result.status).toBe('blocked');
    expect(result.skill).toBeNull();
  });

  test('blocks profanity in search terms', async () => {
    const result = await skillsService.searchSkill('how to fuck');
    expect(result.status).toBe('blocked');
  });

  test('blocks obviously suspicious search terms', async () => {
    const result = await skillsService.searchSkill("python' OR 1=1 --");
    expect(result.status).toBe('blocked');
    expect(result.skill).toBeNull();
  });

  test('allows legitimate searches', async () => {
    const result = await skillsService.searchSkill('cocktail mixing');
    expect(result.status).not.toBe('blocked');
  });

  test('rate limits free users after 5 new skills total per IP', async () => {
    for (let i = 0; i < 5; i++) {
      await skillsService.searchSkill(`newskill${i}`, { ip: '1.2.3.4' });
    }
    const result = await skillsService.searchSkill('newskill99', { ip: '1.2.3.4' });
    expect(result.status).toBe('rate_limited');
    expect(result.skill).toBeNull();
  });

  test('tracks free-user new-skill limits by IP', async () => {
    for (let i = 0; i < 5; i++) {
      await skillsService.searchSkill(`infra${i}`, { ip: '5.6.7.8' });
    }

    const otherIpResult = await skillsService.searchSkill('terraform-cloud', { ip: '8.7.6.5' });
    expect(['pending', 'scraping']).toContain(otherIpResult.status);
  });

  test('does not rate limit premium users on new skill creation window', async () => {
    const premiumUser = { id: 42, subscription_status: 'active' };
    for (let i = 0; i < 6; i++) {
      const result = await skillsService.searchSkill(`premiumskill${i}`, { user: premiumUser, ip: '9.9.9.9' });
      expect(['pending', 'scraping']).toContain(result.status);
    }
  });

  test('uses persistent user free-skill count for logged-in free users', async () => {
    const user = await db.createUser({ email: 'freeuser@example.com', password_hash: 'hash', name: 'Free User' });
    await db.insert('UPDATE users SET free_skill_creations_count = 5 WHERE id = ?', [user.id]);

    const result = await skillsService.searchSkill('vector-database', {
      user: { id: user.id, subscription_status: 'free' },
      ip: '10.0.0.1',
    });

    expect(result.status).toBe('rate_limited');
    expect(result.skill).toBeNull();
  });
});

// --- getSkillContent ---

describe('getSkillContent', () => {
  test('returns content for ready skills', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('python', 'Python', 'ready')"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source, duration, views) VALUES ('v1', 'python', 'video', 'Intro to Python', 'https://example.com/v1', 'youtube', '10:00', 5000)"
    );
    await db.insert(
      "INSERT INTO content (id, skill_id, type, title, url, source, author) VALUES ('a1', 'python', 'article', 'Python Guide', 'https://example.com/a1', 'devto', 'Alice')"
    );

    const result = await skillsService.getSkillContent('python');
    expect(result.status).toBe('ready');
    expect(result.content.videos.length).toBe(1);
    expect(result.content.articles.length).toBe(1);
  });

  test('returns pending for non-existent skills and auto-creates', async () => {
    const result = await skillsService.getSkillContent('golang');
    expect(['pending', 'scraping']).toContain(result.status);
    expect(result.skill.id).toBe('golang');
    expect(result.content.videos).toEqual([]);

    // Verify it was created in DB
    const row = await db.getSkillById('golang');
    expect(row).not.toBeNull();
    expect(row.status).toBe('pending');
  });

  test('returns pending status for pending skills without crashing', async () => {
    await db.insert(
      "INSERT INTO skills (id, name, status) VALUES ('rust', 'Rust', 'pending')"
    );
    const result = await skillsService.getSkillContent('rust');
    expect(['pending', 'scraping']).toContain(result.status);
    expect(result.content.videos).toEqual([]);
    expect(result.content.articles).toEqual([]);
    expect(result.content.courses).toEqual([]);
  });
});
