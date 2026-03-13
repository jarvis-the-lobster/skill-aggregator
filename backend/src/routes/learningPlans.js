const express = require('express');
const router = express.Router();
const learningPlanService = require('../services/learningPlanService');
const { requireAuth } = require('../middleware/auth');

// GET /api/learning-plans/:skillId — public, returns saved 30-day plan
router.get('/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;
    const plan = await learningPlanService.getPlan(skillId);
    res.json({ skillId, plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/learning-plans/:skillId/generate — (re)generate plan (admin only)
router.post('/:skillId/generate', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const plan = await learningPlanService.generatePlan(skillId);
    res.json({ skillId, plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
