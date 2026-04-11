const express = require('express');
const router = express.Router();
const db = require('../models/database');
const learningPlanService = require('../services/learningPlanService');
const reviewContentService = require('../services/reviewContentService');
const streakService = require('../services/streakService');
const { requireAuth } = require('../middleware/auth');
const { bulkLimiter } = require('../middleware/rateLimit');

function requireCronSecretOrAdmin(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (secret && token === secret) {
    req.adminAuth = { kind: 'cron-secret' };
    return next();
  }

  return requireAuth(req, res, next);
}

// GET /api/learning-plans/bulk — public, returns ALL learning plans grouped by skill
router.get('/bulk', bulkLimiter, async (req, res) => {
  try {
    const rows = await db.getAllLearningPlans();
    const plans = {};
    for (const row of rows) {
      if (!plans[row.skill_id]) plans[row.skill_id] = [];
      plans[row.skill_id].push({
        day_number: row.day_number,
        content_type: row.content_type,
        reason: row.reason,
        title: row.title,
        url: row.url,
        source: row.source,
      });
    }
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/learning-plans/:skillId — public, returns saved 30-day plan
router.get('/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;
    const { plan, planReady, reviewContent } = await learningPlanService.getPlanWithReadiness(skillId);
    res.json({ skillId, plan, planReady, reviewContent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/learning-plans/:skillId/generate — (re)generate shared plan
router.post('/:skillId/generate', requireCronSecretOrAdmin, async (req, res) => {
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
    // Also enroll in the course so it shows in my-courses
    await db.enrollCourse(req.user.id, skillId);
    // Copy shared plan into user's personal learning plan (only if they don't have one already)
    const existingPlan = await db.getUserLearningPlan(req.user.id, skillId);
    if (existingPlan.length === 0) {
      await learningPlanService.copyPlanForUser(req.user.id, skillId);
    }
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
    if (!progress) return res.json({ enrolled: false, progress: null, plan: null, refreshAvailable: false, planReady: true, reviewContent: {} });
    const { plan, refreshAvailable, planReady, reviewContent } = await learningPlanService.getUserPlanWithRefresh(req.user.id, skillId);
    res.json({ enrolled: true, progress, plan, refreshAvailable, planReady, reviewContent });
  } catch (err) {
    console.error('Plan progress error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// POST /api/learning-plans/:skillId/refresh — refresh incomplete days with new content
router.post('/:skillId/refresh', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const progress = await db.getPlanProgress(req.user.id, skillId);
    if (!progress) return res.status(404).json({ error: 'Not enrolled in this plan' });
    const plan = await learningPlanService.refreshUserPlan(req.user.id, skillId);
    res.json({ refreshed: true, plan });
  } catch (err) {
    console.error('Plan refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh plan' });
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
