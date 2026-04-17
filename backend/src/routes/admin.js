const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const { validateReviewBody } = require('../utils/reviewBodySchema');

const PREMIUM_PLAN_DAY_RANGES = {
  7: [8, 14],
  14: [15, 21],
  21: [22, 28],
  28: [29, 30],
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireCronSecretMiddleware(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Accepts either CRON_SECRET or authenticated admin user
function requireCronSecretOrAdmin(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  // Allow CRON_SECRET bearer token
  if (secret && auth === `Bearer ${secret}`) {
    return next();
  }
  // Fall back to JWT + admin email check
  requireAuth(req, res, (err) => {
    if (err) return; // requireAuth already sent response
    if (!ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

// GET /api/admin/metrics — ops dashboard (CRON_SECRET or admin user)
router.get('/metrics', requireCronSecretOrAdmin, async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    res.json(metrics);
  } catch (err) {
    console.error('Admin metrics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/admin/users — list all users (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, email, name AS display_name, created_at, last_login AS last_login_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/import-skills — run skills seed import (Bearer CRON_SECRET)
router.post('/import-skills', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db = require('../models/database');
    const skills = require('../data/skills-seed');
    let imported = 0, skipped = 0;
    for (const skill of skills) {
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT OR IGNORE INTO skills (id, name, category, difficulty, description, estimated_hours) VALUES (?, ?, ?, ?, ?, ?)`,
          [skill.id, skill.name, skill.category, skill.difficulty, skill.description, skill.estimatedHours],
          function (err) {
            if (err) return reject(err);
            this.changes > 0 ? imported++ : skipped++;
            resolve();
          }
        );
      });
    }
    console.log(`[import-skills] Imported ${imported}, skipped ${skipped}`);
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    console.error('[import-skills] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scrape/nightly — trigger nightly scrape (Bearer CRON_SECRET)
router.post('/scrape/nightly', (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Run inline in the same process — detached child processes get killed in Railway containers
  const { runNightlyScrape } = require('../scripts/nightly-scrape');
  res.json({ ok: true, message: 'Nightly scrape started' });

  // Fire and forget — errors are logged internally
  runNightlyScrape().catch((err) => {
    console.error('[scrape/nightly] Fatal error:', err.message);
  });
});

// POST /api/admin/send-streak-reminders — send push reminders (Bearer CRON_SECRET)
router.post('/send-streak-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pushService = require('../services/pushService');

    // Get today's date in Pacific time (matches streak system)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    // Users with active streaks who haven't completed today.
    // LEFT JOIN so we target all at-risk streaks for in-app notifications,
    // not just those opted into browser push.
    const users = await db.query(
      `SELECT us.user_id, us.current_streak,
              MAX(CASE WHEN ps.user_id IS NOT NULL THEN 1 ELSE 0 END) AS has_push
       FROM user_streaks us
       LEFT JOIN push_subscriptions ps ON ps.user_id = us.user_id
       WHERE us.current_streak > 0
         AND (us.last_activity_date IS NULL OR us.last_activity_date != ?)
       GROUP BY us.user_id, us.current_streak`,
      [today]
    );

    let sent = 0;
    let failed = 0;
    let inAppCreated = 0;
    for (const user of users) {
      try {
        await db.createNotification({
          user_id: user.user_id,
          type: 'streak_reminder',
          title: 'Your streak is at risk!',
          body: `Complete today's lesson to keep your ${user.current_streak}-day streak alive.`,
          data: { currentStreak: user.current_streak, url: '/my-courses' },
        });
        inAppCreated++;
      } catch (err) {
        console.error(`[streak-reminders] In-app notification failed for user ${user.user_id}:`, err.message);
      }

      if (user.has_push) {
        try {
          const result = await pushService.sendStreakReminder(user.user_id, user.current_streak);
          sent += result.sent;
          failed += result.failed;
        } catch (err) {
          failed++;
          console.error(`[streak-reminders] Push failed for user ${user.user_id}:`, err.message);
        }
      }
    }

    console.log(`[streak-reminders] Push sent ${sent}, push failed ${failed}, in-app ${inAppCreated}, users targeted ${users.length}`);
    res.json({ ok: true, usersTargeted: users.length, sent, failed, inAppCreated });
  } catch (err) {
    console.error('[streak-reminders] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/test-push — send a test push to a user (Bearer CRON_SECRET)
router.post('/test-push', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const pushService = require('../services/pushService');
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = await pushService.sendPushToUser(userId, {
      title: '🔥 LearnStack Test',
      body: 'Push notifications are working! Keep learning.',
      icon: '/vite.svg',
      url: '/my-courses',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/review-jobs — list pending review content generation jobs (Bearer CRON_SECRET)
router.get('/review-jobs', async (req, res) => {
  if (!requireCronSecret(req, res)) return;

  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 100);
    const pendingJobs = await db.getPendingJobs(limit);
    const reviewJobs = pendingJobs
      .filter((job) => job.job_type === 'review_content')
      .map((job) => ({
        id: job.id,
        skillId: job.skill_id,
        userId: job.user_id,
        dayNumber: job.day_number,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        payload: job.payload ? JSON.parse(job.payload) : null,
        planCreatedAt: job.plan_created_at,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      }));

    res.json({
      ok: true,
      jobs: reviewJobs,
      count: reviewJobs.length,
    });
  } catch (err) {
    console.error('[review-jobs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/review-jobs/:id/process — save generated review content and mark job complete (Bearer CRON_SECRET)
router.post('/review-jobs/:id/process', async (req, res) => {
  if (!requireCronSecret(req, res)) return;

  try {
    const jobId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Valid numeric job id required' });
    }

    const claimedJob = await db.claimJob(jobId);
    if (!claimedJob) {
      const existing = await db.query('SELECT id, status, job_type FROM plan_jobs WHERE id = ?', [jobId]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }
      return res.status(409).json({ error: `Job is not pending (current status: ${existing[0].status})` });
    }

    if (claimedJob.job_type !== 'review_content') {
      await db.failJob(jobId, 'Unsupported job type for review job processor');
      return res.status(400).json({ error: `Unsupported job type: ${claimedJob.job_type}` });
    }

    const {
      reviewType = 'weekly_checkin',
      title,
      body,
      result = null,
    } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      await db.failJob(jobId, 'title is required');
      return res.status(400).json({ error: 'title is required' });
    }

    const validation = validateReviewBody(body);
    if (validation.error) {
      await db.failJob(jobId, validation.error);
      return res.status(400).json({ error: validation.error });
    }

    await db.saveSharedReviewContent({
      skill_id: claimedJob.skill_id,
      day_number: claimedJob.day_number,
      review_type: reviewType,
      title: title.trim(),
      body: validation.value,
      plan_created_at: claimedJob.plan_created_at,
    });

    await db.completeJob(jobId, result || {
      reviewType,
      title: title.trim(),
      saved: true,
      knowledgeChecks: validation.value.knowledge_checks.length,
    });

    res.json({
      ok: true,
      jobId,
      status: 'completed',
      skillId: claimedJob.skill_id,
      dayNumber: claimedJob.day_number,
    });
  } catch (err) {
    console.error('[review-jobs/process] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/premium-plans/jobs — list pending premium plan generation jobs (CRON_SECRET or admin)
router.get('/premium-plans/jobs', requireCronSecretOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 100);
    const premiumJobs = (await db.getPendingPremiumPlanJobs(limit))
      .map((job) => {
        const payload = job.payload ? JSON.parse(job.payload) : null;
        const triggerDay = payload?.triggerDay || job.day_number || null;
        const targetRange = triggerDay ? PREMIUM_PLAN_DAY_RANGES[triggerDay] : null;
        return {
          id: job.id,
          skillId: job.skill_id,
          userId: job.user_id,
          dayNumber: job.day_number,
          triggerDay,
          targetDays: targetRange ? { start: targetRange[0], end: targetRange[1] } : null,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.max_attempts,
          payload,
          planCreatedAt: job.plan_created_at,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };
      });

    res.json({
      ok: true,
      jobs: premiumJobs,
      count: premiumJobs.length,
    });
  } catch (err) {
    console.error('[premium-plans/jobs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/premium-plans/context/:userId/:skillId — gather LLM context for premium plan curation
router.get('/premium-plans/context/:userId/:skillId', requireCronSecretOrAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const skillId = req.params.skillId;

    const DAY_RANGES = PREMIUM_PLAN_DAY_RANGES;

    const jobs = await db.query(
      `SELECT * FROM plan_jobs WHERE job_type = 'premium_plan_generation' AND user_id = ? AND skill_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [userId, skillId]
    );
    const job = jobs[0] || null;
    const triggerDay = job ? JSON.parse(job.payload || '{}').triggerDay : null;
    const range = triggerDay ? DAY_RANGES[triggerDay] : null;

    const reviewSubmissions = triggerDay ? await db.query(
      `SELECT rs.day_number, rs.result_summary, rs.reflection,
              rsa.question, rsa.answer, rsa.correct, rsa.check_type
       FROM review_submissions rs
       LEFT JOIN review_submission_answers rsa ON rsa.submission_id = rs.id
       WHERE rs.user_id = ? AND rs.skill_id = ? AND rs.day_number = ?
       ORDER BY rsa.id ASC`,
      [userId, skillId, triggerDay]
    ) : [];

    const totalAnswers = reviewSubmissions.filter(r => r.correct !== null).length;
    const correctAnswers = reviewSubmissions.filter(r => r.correct === 1).length;

    const userPlan = await db.getUserLearningPlan(userId, skillId);
    const progress = await db.getPlanProgress(userId, skillId);
    const completedDays = JSON.parse(progress?.completed_days || '[]');

    const usedContentIds = new Set(userPlan.map(e => e.content_id).filter(Boolean));
    const allContent = await db.getSkillContent(skillId);
    const availableContent = allContent
      .filter(c => !usedContentIds.has(c.id))
      .map(c => ({
        id: c.id,
        type: c.type,
        title: c.title,
        url: c.url,
        source: c.source,
        duration: c.duration,
        views: c.views,
        description: c.description ? c.description.slice(0, 200) : null,
      }));

    const skill = await db.getSkillById(skillId);

    res.json({
      jobId: job?.id || null,
      userId,
      skillId,
      skillName: skill?.name || skillId,
      triggerDay,
      targetDays: range ? { start: range[0], end: range[1] } : null,
      reviewScore: { correct: correctAnswers, total: totalAnswers },
      reviewSubmissions,
      currentPlan: userPlan.map(e => ({
        day_number: e.day_number,
        content_id: e.content_id,
        content_type: e.content_type,
        title: e.title,
        completed: completedDays.includes(e.day_number),
      })),
      availableContent,
      instructions: 'Select content from availableContent for each target day. Target 25-45 minutes total per day. Prefer content matching topics from reviewSubmissions answers. Fall back to highest-viewed content if no topic match. Return an array of { day_number, content_id, content_type, reason } objects. If reviewScore is 7+ out of 8, note user is on track and continue at current difficulty.',
    });
  } catch (err) {
    console.error('premium-plans/context error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/premium-plans/save/:userId/:skillId — save LLM-curated premium plan days
router.post('/premium-plans/save/:userId/:skillId', requireCronSecretOrAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const skillId = req.params.skillId;
    const { jobId, days } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'valid userId required' });
    }

    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'days array required' });
    }

    const jobRows = jobId ? await db.query('SELECT * FROM plan_jobs WHERE id = ?', [jobId]) : [];
    const job = jobRows[0] || null;
    if (jobId && !job) {
      return res.status(404).json({ error: 'job not found' });
    }

    if (job && (job.user_id !== userId || job.skill_id !== skillId || job.job_type !== 'premium_plan_generation')) {
      return res.status(400).json({ error: 'job does not match target user/skill' });
    }

    const triggerDay = job ? JSON.parse(job.payload || '{}').triggerDay || job.day_number : null;
    const allowedRange = triggerDay ? PREMIUM_PLAN_DAY_RANGES[triggerDay] : null;
    if (!allowedRange) {
      return res.status(400).json({ error: 'premium plan save requires a valid trigger day job' });
    }

    const progress = await db.getPlanProgress(userId, skillId);
    const completedDays = new Set(JSON.parse(progress?.completed_days || '[]'));
    const availableContent = await db.getSkillContent(skillId);
    const contentById = new Map(availableContent.map((content) => [content.id, content]));
    const seenDays = new Set();
    const normalizedDays = [];
    const reviewDays = [];

    for (const entry of days) {
      const dayNumber = Number(entry?.day_number);
      if (!Number.isInteger(dayNumber)) {
        return res.status(400).json({ error: 'each day must have an integer day_number' });
      }
      if (dayNumber < allowedRange[0] || dayNumber > allowedRange[1]) {
        return res.status(400).json({ error: `day_number must be between ${allowedRange[0]} and ${allowedRange[1]}` });
      }
      if (seenDays.has(dayNumber)) {
        return res.status(400).json({ error: `duplicate day_number: ${dayNumber}` });
      }
      if (completedDays.has(dayNumber)) {
        return res.status(400).json({ error: `cannot overwrite completed day ${dayNumber}` });
      }

      const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
      if (!reason) {
        return res.status(400).json({ error: `day ${dayNumber} must include a reason` });
      }

      if (entry?.content_type === 'review') {
        const title = typeof entry?.review_title === 'string' ? entry.review_title.trim() : '';
        const reviewBody = entry?.review_body;
        const validation = validateReviewBody(reviewBody);
        if (!title) {
          return res.status(400).json({ error: `review day ${dayNumber} must include a review_title` });
        }
        if (validation.error) {
          return res.status(400).json({ error: `review day ${dayNumber}: ${validation.error}` });
        }

        seenDays.add(dayNumber);
        reviewDays.push({
          day_number: dayNumber,
          reason,
          review_title: title,
          review_body: validation.value,
        });
        continue;
      }

      const contentId = entry?.content_id;
      if (!contentId || typeof contentId !== 'string') {
        return res.status(400).json({ error: `day ${dayNumber} must include a valid content_id` });
      }

      const content = contentById.get(contentId);
      if (!content) {
        return res.status(400).json({ error: `content_id ${contentId} does not belong to skill ${skillId}` });
      }
      if (entry?.content_type && entry.content_type !== content.type) {
        return res.status(400).json({ error: `content_type mismatch for day ${dayNumber}` });
      }

      seenDays.add(dayNumber);
      normalizedDays.push({
        day_number: dayNumber,
        content_id: content.id,
        content_type: content.type,
        reason,
      });
    }

    await db.savePremiumPlanDays(userId, skillId, normalizedDays);
    for (const reviewDay of reviewDays) {
      await db.saveReviewContent({
        skill_id: skillId,
        user_id: userId,
        day_number: reviewDay.day_number,
        review_type: 'weekly_checkin',
        title: reviewDay.review_title,
        body: reviewDay.review_body,
        plan_created_at: job?.plan_created_at || new Date().toISOString(),
      });
      await db.insert(
        `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, created_at)
         VALUES (?, ?, ?, NULL, 'review', ?, 'ready', ?, ?, CURRENT_TIMESTAMP)`,
        [userId, skillId, reviewDay.day_number, reviewDay.reason, reviewDay.review_title, JSON.stringify(reviewDay.review_body)]
      );
    }

    if (jobId) {
      await db.completeJob(jobId, { generated: true, days: normalizedDays.length, reviewDays: reviewDays.length });
    }

    const skill = await db.getSkillById(skillId);
    const startDay = Math.min(...days.map(d => d.day_number));
    const endDay = Math.max(...days.map(d => d.day_number));

    await db.createNotification({
      user_id: userId,
      type: 'premium_plan_ready',
      title: 'Your personalized plan is ready',
      body: `Days ${startDay}-${endDay} for ${skill?.name || skillId} have been hand-picked based on your review responses. Open your plan to apply them.`,
      data: { skillId, startDay, endDay },
    });

    res.json({ saved: true });
  } catch (err) {
    console.error('premium-plans/save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Skill Management ──────────────────────────────────────────────────────

// Helper: verify CRON_SECRET
function requireCronSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// DELETE /api/admin/skills/:id — delete a skill and all related data
router.delete('/skills/:id', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const skill = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (skill.length === 0) return res.status(404).json({ error: 'Skill not found' });

    await db.insert('DELETE FROM content WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_courses WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_plan_progress WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM scrape_log WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM plan_jobs WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM plan_review_content WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error('Delete skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/rename — rename a skill ID (moves all related data)
router.post('/skills/:id/rename', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { newId, newName } = req.body;
    if (!newId) return res.status(400).json({ error: 'newId required' });

    const existing = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Skill not found' });

    const conflict = await db.query('SELECT id FROM skills WHERE id = ?', [newId]);
    if (conflict.length > 0) return res.status(409).json({ error: `Skill '${newId}' already exists. Use merge instead.` });

    // Create new skill with old skill's data
    await db.insert(
      `INSERT INTO skills (id, name, category, difficulty, description, estimated_hours, status, last_scraped_at)
       SELECT ?, COALESCE(?, name), category, difficulty, description, estimated_hours, status, last_scraped_at
       FROM skills WHERE id = ?`,
      [newId, newName || null, id]
    );

    // Move all related data
    await db.insert('UPDATE content SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE learning_plans SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE user_courses SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE user_plan_progress SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('UPDATE scrape_log SET skill_id = ? WHERE skill_id = ?', [newId, id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({ ok: true, renamed: `${id} → ${newId}` });
  } catch (err) {
    console.error('Rename skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/merge — merge a skill into another (moves content, deletes source)
router.post('/skills/:id/merge', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });

    const source = await db.query('SELECT id FROM skills WHERE id = ?', [id]);
    if (source.length === 0) return res.status(404).json({ error: `Source skill '${id}' not found` });

    const target = await db.query('SELECT id FROM skills WHERE id = ?', [targetId]);
    if (target.length === 0) return res.status(404).json({ error: `Target skill '${targetId}' not found` });

    // Move content that doesn't already exist in target (avoid duplicates)
    await db.insert(
      `UPDATE content SET skill_id = ? WHERE skill_id = ? AND id NOT IN (SELECT id FROM content WHERE skill_id = ?)`,
      [targetId, id, targetId]
    );

    // Clean up remaining references
    await db.insert('DELETE FROM content WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM learning_plans WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM scrape_log WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_courses WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM user_plan_progress WHERE skill_id = ?', [id]);
    await db.insert('DELETE FROM skills WHERE id = ?', [id]);

    res.json({
      ok: true,
      merged: `${id} → ${targetId}`,
      warning: 'Legacy merge endpoint does not safely preserve all user state. Prefer /api/admin/skills/:id/safe-merge for production use.'
    });
  } catch (err) {
    console.error('Merge skill error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/safe-merge — safe merge with dry-run support
router.post('/skills/:id/safe-merge', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { targetId, mode = 'dry-run', renameTargetName } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    if (id === targetId) return res.status(400).json({ error: 'sourceId and targetId must differ' });
    if (!['dry-run', 'execute'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be dry-run or execute' });
    }

    const skillMergeService = require('../services/skillMergeService');
    const result = await skillMergeService.safeMerge(id, targetId, {
      dryRun: mode !== 'execute',
      renameTargetName,
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    console.error('Safe merge error:', err.message);
    res.status(status).json({ error: err.message });
  }
});

// POST /api/admin/skills/:id/category — update a skill category
router.post('/skills/:id/category', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (typeof category !== 'string') {
      return res.status(400).json({ error: 'category string required' });
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (!normalizedCategory) {
      return res.status(400).json({ error: 'category cannot be empty' });
    }
    if (normalizedCategory.length > 64) {
      return res.status(400).json({ error: 'category too long' });
    }
    if (!/^[a-z0-9-]+$/.test(normalizedCategory)) {
      return res.status(400).json({ error: 'category must contain only lowercase letters, numbers, and hyphens' });
    }

    const existing = await db.query('SELECT id, category FROM skills WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Skill not found' });

    await db.insert('UPDATE skills SET category = ? WHERE id = ?', [normalizedCategory, id]);

    res.json({
      ok: true,
      skillId: id,
      previousCategory: existing[0].category || null,
      category: normalizedCategory
    });
  } catch (err) {
    console.error('Update skill category error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/skills/reset-stale — reset last_scraped_at for low-content skills
router.post('/skills/reset-stale', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  try {
    const threshold = parseInt(req.query.threshold || '30');
    const skills = await db.query(
      `SELECT s.id, COUNT(c.id) as content_count
       FROM skills s LEFT JOIN content c ON c.skill_id = s.id
       GROUP BY s.id HAVING content_count < ?`,
      [threshold]
    );
    const ids = skills.map(s => s.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await db.insert(`UPDATE skills SET last_scraped_at = NULL WHERE id IN (${placeholders})`, ids);
    }
    res.json({ ok: true, reset: ids.length, skills: ids });
  } catch (err) {
    console.error('Reset stale error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scrape/skills — scrape specific skills by ID (Bearer CRON_SECRET)
// Body: { "skillIds": ["linux", "supply-chain", "music-production"] }
router.post('/scrape/skills', async (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const { skillIds } = req.body;
  if (!Array.isArray(skillIds) || skillIds.length === 0) {
    return res.status(400).json({ error: 'skillIds array required' });
  }
  if (skillIds.length > 20) {
    return res.status(400).json({ error: 'Max 20 skills per request' });
  }

  // Validate all skills exist
  const placeholders = skillIds.map(() => '?').join(',');
  const existing = await db.query(`SELECT id FROM skills WHERE id IN (${placeholders})`, skillIds);
  const existingIds = new Set(existing.map(s => s.id));
  const missing = skillIds.filter(id => !existingIds.has(id));
  if (missing.length > 0) {
    return res.status(404).json({ error: `Skills not found: ${missing.join(', ')}` });
  }

  res.json({ ok: true, message: `Scraping ${skillIds.length} skill(s)`, skillIds });

  // Fire and forget
  const scraper = require('../services/scraperService');
  (async () => {
    for (const skillId of skillIds) {
      console.log(`[admin/scrape] Scraping: ${skillId}`);
      try {
        await db.updateSkillStatus(skillId, 'scraping');
        await scraper.scrapeSkill(skillId);
        await db.updateSkillStatus(skillId, 'ready');
        console.log(`[admin/scrape] ✅ ${skillId} done`);
      } catch (err) {
        await db.updateSkillStatus(skillId, 'error');
        console.error(`[admin/scrape] ❌ ${skillId}: ${err.message}`);
      }
    }
    console.log(`[admin/scrape] Finished all ${skillIds.length} skill(s)`);
  })().catch(err => console.error('[admin/scrape] Fatal:', err.message));
});

module.exports = router;
