const db = require('../models/database');

const REVIEW_DAYS = [7, 14, 21, 28];

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
          const outcome = await this.processReviewJob(job);
          if (outcome === 'completed') {
            results.succeeded++;
          } else {
            results.failed++;
          }
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

      // Free-tier review content is intentionally left pending for async generation.
      // A future cron/AI generation pipeline will replace this stub behavior by
      // writing actual content into plan_review_content and then completing the job.
      await db.failJob(claimed.id, 'Review generation pipeline not configured yet');
      return 'pending_external_generation';
    } catch (err) {
      await db.failJob(claimed.id, err.message);
      throw err;
    }
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
