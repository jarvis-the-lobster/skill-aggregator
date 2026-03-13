const express = require('express');
const router = express.Router();
const skillsService = require('../services/skillsService');
const analytics = require('../services/analyticsService');

// GET /api/skills - List all skills from DB
router.get('/', async (req, res) => {
  try {
    const skills = await skillsService.getAllSkills();
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/search?q=kubernetes - On-demand skill search
// IMPORTANT: must be defined before /:skill to avoid route shadowing
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const result = await skillsService.searchSkill(q.trim());
    analytics.trackSkillSearched({
      skillId: result.skill?.id,
      skillName: result.skill?.name,
      isNewSkill: result.isNew || false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/:skill - Get skill details + content (with status)
router.get('/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const { type, difficulty, format } = req.query;

    const result = await skillsService.getSkillContent(skill, { type, difficulty, format });
    if (result.status === 'ready' && result.content) {
      const { videos = [], articles = [] } = result.content;
      if (videos.length > 0) {
        analytics.trackSkillContentServed({
          skillId: result.skill?.id,
          skillName: result.skill?.name,
          contentType: 'video',
          resultCount: videos.length,
        });
      }
      if (articles.length > 0) {
        analytics.trackSkillContentServed({
          skillId: result.skill?.id,
          skillName: result.skill?.name,
          contentType: 'article',
          resultCount: articles.length,
        });
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/skills/:skill/scrape - Manually trigger content scraping
router.post('/:skill/scrape', async (req, res) => {
  try {
    const { skill } = req.params;
    // Reset status immediately so the frontend poll detects the state change
    skillsService.scrapeSkillContent(skill, { force: false }).catch(err =>
      console.error(`Manual scrape failed for ${skill}:`, err.message)
    );
    res.json({ message: `Content scraping initiated for "${skill}"` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/:skill/stats - Learning statistics for a skill
router.get('/:skill/stats', async (req, res) => {
  try {
    const { skill } = req.params;
    const stats = await skillsService.getSkillStats(skill);
    res.json({ skill, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
