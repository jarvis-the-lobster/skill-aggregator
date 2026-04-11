const db = require('../models/database');

const REVIEW_DAYS = [7, 14, 21, 28];

const WEEK_LABELS = {
  7: { week: 1, label: 'Week 1', phase: 'Getting Started' },
  14: { week: 2, label: 'Week 2', phase: 'Building Foundations' },
  21: { week: 3, label: 'Week 3', phase: 'Deepening Understanding' },
  28: { week: 4, label: 'Week 4', phase: 'Mastery & Review' },
};

const REFLECTION_POOLS = {
  7: [
    'What concept from this week felt most intuitive to you?',
    'Which resource helped you learn the most, and why?',
    'Try explaining one key concept you learned to someone else.',
  ],
  14: [
    'How has your understanding changed since week 1?',
    'What connections do you see between the topics covered so far?',
    'What would you like to revisit before moving forward?',
  ],
  21: [
    'What is the most challenging concept you have encountered so far?',
    'How would you apply what you have learned to a real project?',
    'What gaps in your understanding do you want to fill in the final week?',
  ],
  28: [
    'Looking back, what are you most proud of learning?',
    'What is one thing you would teach a beginner about this topic?',
    'What is your plan for continuing to build on this foundation?',
  ],
};

function parseDuration(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

class ReviewContentService {
  async enqueueReviewJobs(skillId, planCreatedAt) {
    await db.cancelJobsForSkill(skillId, 'review_content');

    for (const dayNumber of REVIEW_DAYS) {
      await db.createPlanJob({
        skill_id: skillId,
        job_type: 'review_content',
        day_number: dayNumber,
        plan_created_at: planCreatedAt,
      });
    }
  }

  // Premium adaptive reviews will use a different job type and call external APIs.
  // To add: enqueueAdaptiveReviewJobs(skillId, userId, planCreatedAt)

  async processPendingJobs(limit = 50) {
    const jobs = await db.getPendingJobs(limit);
    const results = { processed: 0, succeeded: 0, failed: 0 };

    for (const job of jobs) {
      if (job.job_type === 'review_content') {
        results.processed++;
        try {
          await this.processReviewJob(job);
          results.succeeded++;
        } catch (err) {
          results.failed++;
          console.error(`[review-jobs] Failed job ${job.id} (skill=${job.skill_id}, day=${job.day_number}):`, err.message);
        }
      }
      // Future job types (e.g. 'adaptive_review') handled here
    }

    return results;
  }

  async processReviewJob(job) {
    const claimed = await db.claimJob(job.id);
    if (!claimed) return;

    try {
      const plan = await db.getLearningPlan(claimed.skill_id);
      if (plan.length === 0) {
        await db.failJob(claimed.id, 'No plan found for skill');
        return;
      }

      const skill = await db.getSkillById(claimed.skill_id);
      const skillName = skill?.name || claimed.skill_id;
      const reviewContent = this.generateWeeklyCheckin(skillName, claimed.day_number, plan);

      await db.saveReviewContent({
        skill_id: claimed.skill_id,
        user_id: claimed.user_id,
        day_number: claimed.day_number,
        review_type: 'weekly_checkin',
        title: reviewContent.title,
        body: reviewContent,
        plan_created_at: claimed.plan_created_at,
      });

      await db.completeJob(claimed.id, { day_number: claimed.day_number });
    } catch (err) {
      await db.failJob(claimed.id, err.message);
      throw err;
    }
  }

  generateWeeklyCheckin(skillName, dayNumber, plan) {
    const meta = WEEK_LABELS[dayNumber];
    if (!meta) throw new Error(`Invalid review day: ${dayNumber}`);

    const weekStart = dayNumber - 6;
    const weekEnd = dayNumber;
    const weekDays = plan.filter(d => d.day_number >= weekStart && d.day_number <= weekEnd);

    const contentCovered = weekDays
      .filter(d => d.content_id)
      .map(d => ({
        day: d.day_number,
        title: d.title || 'Untitled',
        type: d.content_type || 'unknown',
        source: d.source || null,
      }));

    const videoCount = contentCovered.filter(c => c.type === 'video').length;
    const articleCount = contentCovered.filter(c => c.type === 'article').length;

    const totalMinutes = weekDays
      .filter(d => d.duration)
      .reduce((sum, d) => sum + Math.round(parseDuration(d.duration) / 60), 0);

    const parts = [];
    if (videoCount > 0) parts.push(`${videoCount} video${videoCount > 1 ? 's' : ''}`);
    if (articleCount > 0) parts.push(`${articleCount} article${articleCount > 1 ? 's' : ''}`);
    const coverageSummary = parts.length > 0
      ? `You covered ${parts.join(' and ')} on ${skillName}.`
      : `You explored ${skillName} this week.`;

    return {
      title: `${meta.label} Check-in: ${meta.phase}`,
      summary: `${coverageSummary}${totalMinutes > 0 ? ` Estimated study time: ~${totalMinutes} minutes.` : ''}`,
      content_covered: contentCovered,
      reflection_prompts: REFLECTION_POOLS[dayNumber] || [],
      stats: {
        videos: videoCount,
        articles: articleCount,
        total_minutes: totalMinutes,
        days_with_content: contentCovered.length,
      },
    };
  }

  async isPlanFullyReady(skillId) {
    return !(await db.hasIncompleteJobs(skillId, 'review_content'));
  }

  async getReviewContentMap(skillId, userId = null) {
    const rows = await db.getReviewContentForPlan(skillId, userId);
    const map = {};
    for (const row of rows) {
      let body = row.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { /* use as-is */ }
      }
      map[row.day_number] = {
        title: row.title,
        body,
        review_type: row.review_type,
        day_number: row.day_number,
      };
    }
    return map;
  }
}

const service = new ReviewContentService();
service.REVIEW_DAYS = REVIEW_DAYS;
module.exports = service;
