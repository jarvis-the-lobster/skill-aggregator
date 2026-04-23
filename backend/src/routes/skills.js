const express = require('express');
const router = express.Router();
const skillsService = require('../services/skillsService');
const analytics = require('../services/analyticsService');
const { optionalAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimit');

// GET /api/skills/counts?ids=python,javascript,react — content count per skill (lightweight)
router.get('/counts', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ error: 'ids query param required' });
    if (ids.length > 50) return res.status(400).json({ error: 'max 50 ids per request' });
    const db = require('../models/database');
    const counts = await db.getContentCounts(ids);
    res.json({ counts });
  } catch (err) {
    console.error('Error fetching content counts:', err);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

// GET /api/skills - List all skills from DB
router.get('/', async (req, res) => {
  try {
    const skills = await skillsService.getAllSkills();
    res.json({ skills });
  } catch (error) {
    console.error('Error listing skills:', error.message);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// GET /api/skills/search?q=kubernetes - On-demand skill search
// IMPORTANT: must be defined before /:skill to avoid route shadowing
router.get('/search', searchLimiter, optionalAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const sanitizedQuery = q.trim().slice(0, 200).replace(/[<>"']/g, '');
    const result = await skillsService.searchSkill(sanitizedQuery, {
      user: req.user || null,
      ip: req.ip,
    });
    analytics.trackSkillSearched({
      skillId: result.skill?.id,
      skillName: result.skill?.name,
      isNewSkill: result.isNew || false,
      url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      distinctId: req.user ? `user_${req.user.id}` : undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('Error searching skills:', error.message);
    res.status(500).json({ error: 'Failed to search skills' });
  }
});

// GET /api/skills/:skill - Get skill details + content (with status)
router.get('/:skill', optionalAuth, async (req, res) => {
  try {
    const { skill } = req.params;
    const { type, difficulty, format } = req.query;

    const result = await skillsService.getSkillContent(skill, { type, difficulty, format });
    if (result.status === 'ready' && result.content) {
      const { videos = [], articles = [] } = result.content;
      const skillUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const distinctId = req.user ? `user_${req.user.id}` : undefined;
      analytics.trackSkillContentServed({
        skillId: result.skill?.id,
        skillName: result.skill?.name,
        videoCount: videos.length,
        articleCount: articles.length,
        url: skillUrl,
        distinctId,
      });
    }
    res.json(result);
  } catch (error) {
    console.error(`Error fetching skill content for ${req.params.skill}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch skill content' });
  }
});

// POST /api/skills/:skill/scrape - User-facing refresh — returns current DB content only.
// Scraping is handled by the nightly cron job; user actions must NOT hit the YouTube API.
router.post('/:skill/scrape', async (req, res) => {
  try {
    const { skill } = req.params;
    const result = await skillsService.getSkillContent(skill);
    res.json(result);
  } catch (error) {
    console.error(`Error fetching scrape content for ${req.params.skill}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch skill content' });
  }
});

// GET /api/skills/:skill/stats - Learning statistics for a skill
router.get('/:skill/stats', async (req, res) => {
  try {
    const { skill } = req.params;
    const stats = await skillsService.getSkillStats(skill);
    res.json({ skill, stats });
  } catch (error) {
    console.error(`Error fetching stats for ${req.params.skill}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch skill stats' });
  }
});

module.exports = router;
