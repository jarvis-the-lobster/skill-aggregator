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

class SkillsService {
  async getAllSkills() {
    return MVP_SKILLS;
  }

  async getSkillContent(skillId, filters = {}) {
    try {
      const content = await this.getCuratedContent(skillId, filters);
      const hasContent = content.videos.length > 0 || content.articles.length > 0;

      if (!hasContent) {
        console.log(`No content found for ${skillId}, triggering background scrape...`);
        this.scrapeSkillContent(skillId).catch(err =>
          console.error(`Background scrape failed for ${skillId}:`, err.message)
        );
        return {
          videos: [],
          articles: [],
          courses: [],
          message: 'Content is being gathered. Please check back in a few minutes.'
        };
      }

      return content;
    } catch (error) {
      console.error('Error getting skill content:', error);
      throw error;
    }
  }

  async getCuratedContent(skillId, filters = {}) {
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

    return { videos, articles, courses: [], totalCount: rows.length };
  }

  async scrapeSkillContent(skillId) {
    console.log(`Starting content scraping for skill: ${skillId}`);
    const result = await scraper.scrapeSkill(skillId);
    console.log(`Scraping done for ${skillId}: ${result.videos.length} videos, ${result.articles.length} articles`);
    return result;
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
