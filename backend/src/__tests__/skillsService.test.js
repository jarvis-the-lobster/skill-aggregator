const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);
jest.mock('../services/scraperService', () => ({
  scrapeSkill: jest.fn().mockResolvedValue({ videos: [], articles: [] }),
}));

const skillsService = require('../services/skillsService');

let db;

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  // Reset rate limit counter between tests
  skillsService._newSkillCount = null;
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

  test('blocks inappropriate search terms', async () => {
    const result = await skillsService.searchSkill('porn');
    expect(result.status).toBe('blocked');
    expect(result.skill).toBeNull();
  });

  test('blocks profanity in search terms', async () => {
    const result = await skillsService.searchSkill('how to fuck');
    expect(result.status).toBe('blocked');
  });

  test('allows legitimate searches', async () => {
    const result = await skillsService.searchSkill('cocktail mixing');
    expect(result.status).not.toBe('blocked');
  });

  test('rate limits after 10 new skills per 6 hours', async () => {
    for (let i = 0; i < 10; i++) {
      await skillsService.searchSkill(`newskill${i}`);
    }
    const result = await skillsService.searchSkill('newskill99');
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
