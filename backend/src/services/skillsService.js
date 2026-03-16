const db = require('../models/database');
const scraper = require('./scraperService');

const MVP_SKILLS = [
  {
    id: 'python',
    name: 'Python Programming',
    category: 'programming',
    difficulty: 'beginner',
    description: 'Learn Python from basics to advanced concepts',
    estimatedHours: 40
  },
  {
    id: 'web-development',
    name: 'Web Development',
    category: 'programming',
    difficulty: 'beginner',
    description: 'HTML, CSS, JavaScript, and modern web frameworks',
    estimatedHours: 60
  },
  {
    id: 'digital-marketing',
    name: 'Digital Marketing',
    category: 'business',
    difficulty: 'beginner',
    description: 'SEO, social media, email marketing, and analytics',
    estimatedHours: 30
  },
  {
    id: 'ui-ux-design',
    name: 'UI/UX Design',
    category: 'design',
    difficulty: 'beginner',
    description: 'User interface and experience design principles',
    estimatedHours: 35
  },
  {
    id: 'data-science',
    name: 'Data Science',
    category: 'programming',
    difficulty: 'intermediate',
    description: 'Statistics, machine learning, and data visualization',
    estimatedHours: 80
  }
];

// Map alternate slugs to canonical skill IDs
const SLUG_ALIASES = {
  'python-programming': 'python',
  'js': 'javascript',
  'javascript-programming': 'javascript',
  'ml': 'machine-learning',
  'ui-ux': 'ui-ux-design',
  'ux-design': 'ui-ux-design',
  'web-dev': 'web-development',
};

// Normalize arbitrary query string to a slug ID
// "Machine Learning" -> "machine-learning"
// "C++" -> "c-plus-plus"
// "Node.js" -> "nodejs"
function normalizeSkillId(query) {
  return query
    .replace(/\+\+/g, '-plus-plus')
    .replace(/\./g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Title-case the original query string
function normalizeSkillName(query) {
  return query
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Map a raw DB row to a consistent JS object
function mapSkillRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'general',
    difficulty: row.difficulty || 'beginner',
    description: row.description || `Learn ${row.name}`,
    estimatedHours: row.estimated_hours || 0,
    status: row.status || 'pending',
    lastScrapedAt: row.last_scraped_at || null
  };
}

class SkillsService {
  // Seed the 5 MVP skills into DB on startup (idempotent)
  async seedMVPSkills() {
    for (const skill of MVP_SKILLS) {
      const existing = await db.getSkillById(skill.id);
      if (!existing) {
        await db.insert(
          'INSERT INTO skills (id, name, category, difficulty, description, estimated_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [skill.id, skill.name, skill.category, skill.difficulty, skill.description, skill.estimatedHours, 'ready']
        );
      } else if (!existing.status || existing.status === 'pending') {
        // Existing row missing status — mark ready since content may already be in DB
        await db.updateSkillStatus(skill.id, 'ready');
      }
    }
  }

  async getAllSkills() {
    const rows = await db.getSkills();
    return rows.map(mapSkillRow);
  }

  // Create a brand-new skill record with status "pending"
  async createSkill(id, name) {
    await db.insert(
      'INSERT OR IGNORE INTO skills (id, name, status) VALUES (?, ?, ?)',
      [id, name, 'pending']
    );
    return mapSkillRow(await db.getSkillById(id));
  }

  // Search for a skill by arbitrary query; creates + scrapes if not found
  async searchSkill(query) {
    const rawId = normalizeSkillId(query);
    const skillId = SLUG_ALIASES[rawId] || rawId;
    const skillName = normalizeSkillName(query);

    const existing = await db.getSkillById(skillId);

    if (existing) {
      if (existing.status === 'ready') {
        const content = await this.getCuratedContent(skillId, {}, existing);
        return { skill: mapSkillRow(existing), status: 'ready', content };
      }
      return { skill: mapSkillRow(existing), status: existing.status || 'scraping' };
    }

    // Not found — create and kick off a background scrape
    const skill = await this.createSkill(skillId, skillName);
    this.scrapeSkillContent(skillId).catch(err =>
      console.error(`Background scrape failed for ${skillId}:`, err.message)
    );
    return { skill, status: 'scraping', message: 'Gathering content...' };
  }

  // Get full skill details + content (used by SkillPage for polling)
  async getSkillContent(skillId, filters = {}) {
    try {
      const skillRow = await db.getSkillById(skillId);

      if (!skillRow) {
        // Auto-create with skillId as name (handles direct URL navigation)
        const skillName = skillId
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const skill = await this.createSkill(skillId, skillName);
        this.scrapeSkillContent(skillId).catch(err =>
          console.error(`Background scrape failed for ${skillId}:`, err.message)
        );
        return { skill, status: 'scraping', content: { videos: [], articles: [], courses: [] } };
      }

      if (skillRow.status === 'ready') {
        const content = await this.getCuratedContent(skillId, filters, skillRow);
        return { skill: mapSkillRow(skillRow), status: 'ready', content };
      }

      return {
        skill: mapSkillRow(skillRow),
        status: skillRow.status || 'scraping',
        content: { videos: [], articles: [], courses: [] }
      };
    } catch (error) {
      console.error('Error getting skill content:', error);
      throw error;
    }
  }

  async getCuratedContent(skillId, filters = {}, skillRow = null) {
    const rows = await db.getSkillContent(skillId, filters.type || null);

    const videos = rows
      .filter(r => r.type === 'video')
      .map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        channel: r.author,
        duration: r.duration,
        views: r.views,
        likes: r.likes,
        rating: r.rating,
        thumbnail: r.thumbnail,
        description: r.description,
        publishedDate: r.published_date,
        tags: r.tags ? JSON.parse(r.tags) : []
      }));

    const articles = rows
      .filter(r => r.type === 'article')
      .map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        author: r.author,
        readTime: r.read_time,
        excerpt: r.description,
        publishedDate: r.published_date,
        tags: r.tags ? JSON.parse(r.tags) : []
      }));

    return { videos, articles, courses: [], totalCount: rows.length, lastScrapedAt: skillRow?.last_scraped_at || null };
  }

  async updateStatus(skillId, status) {
    await db.updateSkillStatus(skillId, status);
  }

  async scrapeSkillContent(skillId, { force = false } = {}) {
    const skillRow = await db.getSkillById(skillId);

    if (!force) {
      // Guard: don't start a second concurrent scrape
      if (skillRow?.status === 'scraping') {
        return;
      }

      // Guard: don't re-scrape within 24 hours
      if (skillRow?.last_scraped_at) {
        const hoursSince = (Date.now() - new Date(skillRow.last_scraped_at).getTime()) / 3600000;
        if (hoursSince < 24) {
          return;
        }
      }
    }

    await db.updateSkillStatus(skillId, 'scraping');

    try {
      const result = await scraper.scrapeSkill(skillId);
      await db.updateSkillStatus(skillId, 'ready');
      await db.updateSkillLastScraped(skillId);
      return result;
    } catch (err) {
      await db.updateSkillStatus(skillId, 'error');
      console.error(`❌ Scrape failed for ${skillId}:`, err.message);
      throw err;
    }
  }

  async getSkillStats(skillId) {
    const rows = await db.getSkillContent(skillId);
    const videos = rows.filter(r => r.type === 'video');
    const articles = rows.filter(r => r.type === 'article');
    const ratings = rows.filter(r => r.rating).map(r => r.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      totalVideos: videos.length,
      totalArticles: articles.length,
      totalCourses: 0,
      avgRating: Math.round(avgRating * 10) / 10,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = new SkillsService();
