const express = require('express');
const router = express.Router();
const skillsService = require('../services/skillsService');

// GET /api/skills - List all available skills
router.get('/', async (req, res) => {
  try {
    const skills = await skillsService.getAllSkills();
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/:skill - Get curated content for a specific skill
router.get('/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const { type, difficulty, format } = req.query;
    
    const content = await skillsService.getSkillContent(skill, {
      type,
      difficulty, 
      format
    });
    
    res.json({ skill, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/skills/:skill/scrape - Trigger content scraping for a skill
router.post('/:skill/scrape', async (req, res) => {
  try {
    const { skill } = req.params;
    const result = await skillsService.scrapeSkillContent(skill);
    res.json({ 
      message: `Content scraping initiated for "${skill}"`,
      result 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/skills/:skill/stats - Get learning statistics for a skill
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