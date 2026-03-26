const express = require('express');
const router = express.Router();
const db = require('../models/database');
const learningPlanService = require('../services/learningPlanService');
const streakService = require('../services/streakService');
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

// POST /api/learning-plans/:skillId/enroll — enroll current user in this plan
router.post('/:skillId/enroll', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const skill = await db.getSkillById(skillId);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    const progress = await db.enrollPlan(req.user.id, skillId);
    // Copy shared plan into user's personal learning plan
    await learningPlanService.copyPlanForUser(req.user.id, skillId);
    res.json({ enrolled: true, progress });
  } catch (err) {
    console.error('Plan enroll error:', err);
    res.status(500).json({ error: 'Failed to enroll' });
  }
});

// GET /api/learning-plans/:skillId/my-progress — get user's personal plan + progress
router.get('/:skillId/my-progress', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const progress = await db.getPlanProgress(req.user.id, skillId);
    if (!progress) return res.json({ enrolled: false, progress: null, plan: null });
    // Serve from user_learning_plans with smart refresh
    const plan = await learningPlanService.getUserPlanWithRefresh(req.user.id, skillId);
    res.json({ enrolled: true, progress, plan });
  } catch (err) {
    console.error('Plan progress error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// POST /api/learning-plans/:skillId/complete-day — mark a day complete
router.post('/:skillId/complete-day', requireAuth, async (req, res) => {
  try {
    const { day } = req.body;
    if (!day || typeof day !== 'number') {
      return res.status(400).json({ error: 'day must be a number' });
    }
    const progress = await db.completePlanDay(req.user.id, req.params.skillId, day);
    if (!progress) return res.status(404).json({ error: 'Not enrolled in this plan' });
    // Record streak activity on plan day completion
    await streakService.recordActivity(req.user.id);
    // Auto-complete course when all 30 days are done
    const completedDays = JSON.parse(progress.completed_days || '[]');
    if (completedDays.length >= 30) {
      await db.updateCourseStatus(req.user.id, req.params.skillId, 'completed');
    }
    res.json({ progress });
  } catch (err) {
    console.error('Complete day error:', err);
    res.status(500).json({ error: 'Failed to mark day complete' });
  }
});

module.exports = router;
