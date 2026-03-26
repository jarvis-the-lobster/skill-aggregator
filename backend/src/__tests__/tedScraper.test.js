const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);

jest.mock('axios');
const axios = require('axios');

const scraperService = require('../services/scraperService');

let db;
const SKILL_ID = 'public-speaking';

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  await db.insert(
    "INSERT INTO skills (id, name, status) VALUES (?, 'Public Speaking', 'ready')",
    [SKILL_ID]
  );
});

afterAll(async () => {
  await db.close();
});

// --- DB / integration tests ---

describe('TED content DB operations', () => {
  test('TED content with ted_ prefix saves correctly via saveContent', async () => {
    const tedContent = [{
      id: 'ted_amy_cuddy_your_body_language',
      type: 'article',
      title: 'Amy Cuddy: Your body language may shape who you are',
      url: 'https://www.ted.com/talks/amy_cuddy_your_body_language',
      source: 'TED',
      author: 'Amy Cuddy',
      tags: ['public-speaking'],
    }];

    await db.saveContent(tedContent, SKILL_ID);
    const rows = await db.getSkillContent(SKILL_ID, 'article');

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('ted_amy_cuddy_your_body_language');
    expect(rows[0].source).toBe('TED');
    expect(rows[0].title).toContain('Amy Cuddy');
  });

  test('TED content with type=article is stored and retrievable', async () => {
    const tedContent = [{
      id: 'ted_talk_1',
      type: 'article',
      title: 'Test TED Talk',
      url: 'https://www.ted.com/talks/test_talk',
      source: 'TED',
      author: 'Speaker',
      tags: [],
    }];

    await db.saveContent(tedContent, SKILL_ID);

    // Retrieve articles only
    const articles = await db.getSkillContent(SKILL_ID, 'article');
    expect(articles.length).toBe(1);
    expect(articles[0].type).toBe('article');

    // Should not appear in video-only queries
    const videos = await db.getSkillContent(SKILL_ID, 'video');
    expect(videos.length).toBe(0);
  });

  test('deduplication — saving same ted_ ID twice does not create duplicates', async () => {
    const tedContent = [{
      id: 'ted_dedup_test',
      type: 'article',
      title: 'Original Title',
      url: 'https://www.ted.com/talks/dedup_test',
      source: 'TED',
      author: 'Speaker',
      tags: [],
    }];

    await db.saveContent(tedContent, SKILL_ID);
    // Save again with updated title
    await db.saveContent([{ ...tedContent[0], title: 'Updated Title' }], SKILL_ID);

    const rows = await db.getSkillContent(SKILL_ID, 'article');
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Updated Title');
  });

  test('scrape_log entries are created for ted source', async () => {
    await db.logScrape({
      skill_id: SKILL_ID,
      source: 'ted',
      status: 'success',
      items_fetched: 5,
      duration_ms: 1200,
    });

    const logs = await db.query(
      "SELECT * FROM scrape_log WHERE source = 'ted' AND skill_id = ?",
      [SKILL_ID]
    );

    expect(logs.length).toBe(1);
    expect(logs[0].source).toBe('ted');
    expect(logs[0].status).toBe('success');
    expect(logs[0].items_fetched).toBe(5);
  });
});

// --- Mock HTML for scrapeTedTalks unit tests ---

const MOCK_TED_HTML = `
<html><body>
  <div class="search__result">
    <a href="/talks/amy_cuddy_body_language?language=en">Amy Cuddy: Your body language may shape who you are</a>
    <div class="search__result__description">Body language affects how others see us.</div>
    <img src="https://ted.com/img/amy.jpg" />
  </div>
  <div class="search__result">
    <a href="/talks/julian_treasure_how_to_speak">Julian Treasure: How to speak so that people want to listen</a>
    <div class="search__result__description">The human voice is powerful.</div>
    <img src="https://ted.com/img/julian.jpg" />
  </div>
</body></html>
`;

describe('scrapeTedTalks', () => {
  test('parses results correctly from mock HTML', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_TED_HTML });

    const results = await scraperService.scrapeTedTalks(SKILL_ID);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('ted_amy_cuddy_body_language');
    expect(results[0].type).toBe('article');
    expect(results[0].url).toBe('https://www.ted.com/talks/amy_cuddy_body_language');
    expect(results[0].source).toBe('TED');
    expect(results[0].author).toBe('Amy Cuddy');
    expect(results[0].title).toContain('Amy Cuddy');

    expect(results[1].id).toBe('ted_julian_treasure_how_to_speak');
    expect(results[1].url).toBe('https://www.ted.com/talks/julian_treasure_how_to_speak');
  });

  test('returns empty array for no results', async () => {
    axios.get.mockResolvedValueOnce({ data: '<html><body></body></html>' });

    const results = await scraperService.scrapeTedTalks(SKILL_ID);

    expect(results).toEqual([]);
  });

  test('handles network errors gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(scraperService.scrapeTedTalks(SKILL_ID)).rejects.toThrow('Network timeout');
  });
});
