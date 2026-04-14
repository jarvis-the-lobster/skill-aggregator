const express = require('express');
const router = express.Router();
const db = require('../models/database');
const learningPlanService = require('../services/learningPlanService');
const streakService = require('../services/streakService');
const { requireAuth } = require('../middleware/auth');
const { hasPremiumAccess } = require('../utils/subscriptionAccess');
const { bulkLimiter } = require('../middleware/rateLimit');

const FREE_PLAN_LIMIT = 1;

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

    const isPremium = hasPremiumAccess(req.user.subscription_status);
    if (!isPremium) {
      const existing = await db.getCourseEnrollment(req.user.id, skillId);
      if (!existing) {
        const activeCount = await db.getActiveEnrollmentCount(req.user.id);
        if (activeCount >= FREE_PLAN_LIMIT) {
          return res.status(403).json({
            error: 'Free accounts are limited to 1 active learning plan at a time. Complete your current plan or upgrade to Premium for unlimited plans.',
            code: 'FREE_PLAN_LIMIT_REACHED',
          });
        }
      }
    }

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

// POST /api/learning-plans/:skillId/review/:dayNumber/submit — submit review answers
router.post('/:skillId/review/:dayNumber/submit', requireAuth, async (req, res) => {
  try {
    const { skillId } = req.params;
    const dayNumber = Number(req.params.dayNumber);
    const { answers, reflection } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers must be a non-empty array' });
    }
    for (const ans of answers) {
      if (!ans.check_id || !ans.question || ans.answer === undefined) {
        return res.status(400).json({ error: 'Each answer must have check_id, question, and answer' });
      }
    }

    const progress = await db.getPlanProgress(req.user.id, skillId);
    if (!progress) {
      return res.status(403).json({ error: 'Not enrolled in this plan' });
    }

    const planTier = await db.getUserPlanTier(req.user.id);

    if (planTier === 'premium') {
      const submission = await db.createReviewSubmission({
        user_id: req.user.id,
        skill_id: skillId,
        day_number: dayNumber,
        status: 'pending',
        reflection: reflection || null,
      });
      await db.saveReviewSubmissionAnswers(submission.id, answers);
      return res.json({ ok: true, submissionId: submission.id, status: 'pending' });
    }

    const reviewContent = await db.getReviewContent(skillId, dayNumber, null);
    let knowledgeChecks = [];
    let contentCovered = [];
    if (reviewContent?.body) {
      const body = typeof reviewContent.body === 'string' ? JSON.parse(reviewContent.body) : reviewContent.body;
      knowledgeChecks = body.knowledge_checks || [];
      contentCovered = Array.isArray(body.content_covered) ? body.content_covered : [];
    }

    const gradedAnswers = answers.map((ans) => {
      const check = knowledgeChecks.find((kc) => kc.id === ans.check_id);
      let correct = null;
      if (check?.type === 'multiple_choice' && Number.isInteger(check.correct_option)) {
        const correctText = check.options?.[check.correct_option];
        correct = ans.answer === correctText ? 1 : 0;
      }
      return { ...ans, correct, topic: check?.topic || null };
    });

    const missed = gradedAnswers.filter((a) => a.correct === 0);
    const mcTotal = gradedAnswers.filter((a) => a.correct !== null).length;
    const mcCorrect = gradedAnswers.filter((a) => a.correct === 1).length;
    const missedTopics = [...new Set(missed.map((m) => m.topic).filter(Boolean))];
    const resultSummary = JSON.stringify({
      total_checks: gradedAnswers.length,
      multiple_choice: { total: mcTotal, correct: mcCorrect },
      missed: missed.map((m) => ({ check_id: m.check_id, question: m.question, topic: m.topic })),
      missed_topics: missedTopics,
      content_to_review: contentCovered,
    });

    const submission = await db.createReviewSubmission({
      user_id: req.user.id,
      skill_id: skillId,
      day_number: dayNumber,
      status: 'completed',
      result_summary: resultSummary,
      reflection: reflection || null,
    });
    await db.saveReviewSubmissionAnswers(submission.id, gradedAnswers);

    const parsedResult = JSON.parse(resultSummary);
    const mc = parsedResult.multiple_choice;
    const scoreText = mc.total > 0 ? `${mc.correct}/${mc.total} correct` : 'Completed';

    let notificationBody;
    if (mc.total === 0) {
      notificationBody = 'Your review has been submitted successfully.';
    } else if (missed.length === 0) {
      notificationBody = `Perfect — ${mc.correct} out of ${mc.total} on your knowledge check.`;
    } else {
      const days = contentCovered.map((c) => c.day).filter((d) => Number.isInteger(d));
      const dayRange = days.length > 0
        ? (days.length === 1 ? `Day ${days[0]}` : `Days ${Math.min(...days)}–${Math.max(...days)}`)
        : null;
      const topicsText = missedTopics.length > 0
        ? ` — topics: ${missedTopics.map((t) => t.replace(/-/g, ' ')).join(', ')}`
        : '';
      const dayText = dayRange ? ` Revisit ${dayRange}` : ' Revisit the covered material';
      notificationBody = `You scored ${mc.correct} out of ${mc.total}.${dayText}${topicsText}.`;
    }

    try {
      await db.createNotification({
        user_id: req.user.id,
        type: 'review_result',
        title: `Review Day ${dayNumber}: ${scoreText}`,
        body: notificationBody,
        data: { submissionId: submission.id, skillId, dayNumber, result: parsedResult },
      });
    } catch (err) {
      console.error('Notification creation error:', err);
    }

    return res.json({
      ok: true,
      submissionId: submission.id,
      status: 'completed',
      result: parsedResult,
    });
  } catch (err) {
    console.error('Review submit error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
