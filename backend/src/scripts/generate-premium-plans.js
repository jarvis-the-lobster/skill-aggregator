if (require.main === module) require('dotenv').config();

const db = require('../models/database');

const DAY_RANGES = {
  7: { start: 8, end: 14 },
  14: { start: 15, end: 21 },
  21: { start: 22, end: 28 },
  28: { start: 29, end: 30 },
};

function parseDurationMinutes(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

function scoreContentMatch(content, reviewAnswerText) {
  if (!reviewAnswerText) return 0;
  const searchText = reviewAnswerText.toLowerCase();
  const title = (content.title || '').toLowerCase();
  const description = (content.description || '').toLowerCase();
  let score = 0;
  const words = searchText.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    if (title.includes(word)) score += 2;
    if (description.includes(word)) score += 1;
  }
  return score;
}

async function processJob(job) {
  const payload = job.payload ? JSON.parse(job.payload) : {};
  const triggerDay = payload.triggerDay;

  if (!triggerDay || !DAY_RANGES[triggerDay]) {
    await db.failJob(job.id, `Invalid triggerDay: ${triggerDay}`);
    return;
  }

  const claimed = await db.claimJob(job.id);
  if (!claimed) return;

  try {
    const user = await db.getUserById(job.user_id);
    if (!user || user.subscription_status !== 'active') {
      await db.completeJob(job.id, { skipped: true, reason: 'user not active premium' });
      return;
    }

    const skill = await db.getSkillById(job.skill_id);
    if (!skill) {
      await db.failJob(job.id, 'Skill not found');
      return;
    }

    const range = DAY_RANGES[triggerDay];
    const isGraduation = triggerDay === 28;

    if (isGraduation) {
      const graduationDays = [];
      for (let d = range.start; d <= range.end; d++) {
        graduationDays.push({
          day_number: d,
          content_id: null,
          content_type: 'graduation',
          reason: 'You have completed 28 days of learning! Here are suggested next steps: consider building a project with what you have learned, or explore a related skill.',
        });
      }
      await db.savePremiumPlanDays(job.user_id, job.skill_id, graduationDays);
    } else {
      const submissions = await db.query(
        `SELECT rs.*, GROUP_CONCAT(rsa.answer, ' ') as all_answers
         FROM review_submissions rs
         LEFT JOIN review_submission_answers rsa ON rsa.submission_id = rs.id
         WHERE rs.user_id = ? AND rs.skill_id = ? AND rs.day_number = ?
         GROUP BY rs.id`,
        [job.user_id, job.skill_id, triggerDay]
      );
      const reviewAnswerText = submissions.map(s => s.all_answers || '').join(' ');

      const existingPlan = await db.getUserLearningPlan(job.user_id, job.skill_id);
      const usedContentIds = new Set(existingPlan.map(e => e.content_id).filter(Boolean));

      const allContent = await db.getSkillContent(job.skill_id);
      const availableContent = allContent.filter(c => !usedContentIds.has(c.id));

      const scored = availableContent.map(c => ({
        ...c,
        matchScore: scoreContentMatch(c, reviewAnswerText),
        durationMins: c.type === 'video' ? parseDurationMinutes(c.duration) : 5,
      }));
      scored.sort((a, b) => b.matchScore - a.matchScore || (b.views || 0) - (a.views || 0));

      const days = [];
      let contentIdx = 0;
      for (let d = range.start; d <= range.end; d++) {
        let dayMinutes = 0;
        const dayContent = [];

        while (contentIdx < scored.length && dayMinutes < 25) {
          const item = scored[contentIdx];
          if (dayMinutes + item.durationMins <= 50) {
            dayContent.push(item);
            dayMinutes += item.durationMins;
            contentIdx++;
          } else {
            break;
          }
        }

        if (dayContent.length === 0 && contentIdx < scored.length) {
          dayContent.push(scored[contentIdx]);
          contentIdx++;
        }

        const primary = dayContent[0];
        days.push({
          day_number: d,
          content_id: primary ? primary.id : null,
          content_type: primary ? primary.type : null,
          reason: primary
            ? `Selected based on your Day ${triggerDay} review responses (${Math.round(dayMinutes)} min)`
            : 'No additional content available',
        });
      }

      await db.savePremiumPlanDays(job.user_id, job.skill_id, days);
    }

    await db.completeJob(job.id, { generated: true, triggerDay });

    const startDay = range.start;
    const endDay = range.end;
    await db.createNotification({
      user_id: job.user_id,
      type: 'premium_plan_ready',
      title: 'Your personalized plan is ready \ud83c\udfaf',
      body: `Days ${startDay}\u2013${endDay} for ${skill.name} have been hand-picked based on your review responses. Open your plan to apply them.`,
      data: { skillId: job.skill_id, startDay, endDay },
    });

    console.log(`[premium-plans] Generated days ${startDay}-${endDay} for user ${job.user_id}, skill ${job.skill_id}`);
  } catch (err) {
    console.error(`[premium-plans] Job ${job.id} failed:`, err.message);
    await db.failJob(job.id, err.message);
  }
}

async function run() {
  console.log(`\n🎯 Premium plan generation started at ${new Date().toISOString()}`);

  const jobs = await db.query(
    `SELECT * FROM plan_jobs
     WHERE job_type = 'premium_plan_generation' AND status = 'pending' AND attempts < max_attempts
     ORDER BY created_at ASC`,
  );

  console.log(`[premium-plans] Found ${jobs.length} pending job(s)`);

  for (const job of jobs) {
    await processJob(job);
  }

  console.log(`[premium-plans] Finished processing ${jobs.length} job(s)`);

  if (require.main === module) await db.close();
}

async function runPremiumPlanGeneration() {
  return run();
}

module.exports = { runPremiumPlanGeneration };

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error in premium plan generation:', err.message);
    process.exit(1);
  });
}
