const db = require('../models/database');

// Quality score: views + rating weighted higher
function qualityScore(row) {
  return (row.views || 0) + (row.rating || 0) * 1000;
}

class LearningPlanService {
  // Generate and persist a 30-day plan for a skill based on existing content
  async generatePlan(skillId) {
    const allContent = await db.getSkillContent(skillId);

    const videos = allContent
      .filter(r => r.type === 'video')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const articles = allContent
      .filter(r => r.type === 'article')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const plan = [];

    // Days 1–7: beginner videos (top by quality)
    for (let day = 1; day <= 7; day++) {
      const item = videos[day - 1] || null;
      plan.push({
        day_number: day,
        content_id: item?.id || null,
        content_type: item ? 'video' : null,
        reason: item ? 'Top-ranked video to get you started' : null,
      });
    }

    // Days 8–14: beginner/intermediate articles
    for (let day = 8; day <= 14; day++) {
      const item = articles[day - 8] || null;
      plan.push({
        day_number: day,
        content_id: item?.id || null,
        content_type: item ? 'article' : null,
        reason: item ? 'Key article to reinforce week 1 concepts' : null,
      });
    }

    // Days 15–21: intermediate videos (next batch)
    for (let day = 15; day <= 21; day++) {
      const item = videos[day - 8] || null; // videos[7..13]
      plan.push({
        day_number: day,
        content_id: item?.id || null,
        content_type: item ? 'video' : null,
        reason: item ? 'Intermediate video to deepen understanding' : null,
      });
    }

    // Days 22–28: advanced articles then videos
    for (let day = 22; day <= 28; day++) {
      const articleIdx = day - 15; // articles[7..13]
      const videoIdx = day - 8;   // videos[14..20]
      const item = articles[articleIdx] || videos[videoIdx] || null;
      const type = articles[articleIdx] ? 'article' : (videos[videoIdx] ? 'video' : null);
      plan.push({
        day_number: day,
        content_id: item?.id || null,
        content_type: type,
        reason: item ? 'Advanced content to master the skill' : null,
      });
    }

    // Days 29–30: best remaining content (capstone)
    const usedIds = new Set(plan.filter(p => p.content_id).map(p => p.content_id));
    const remaining = [...videos, ...articles].filter(c => !usedIds.has(c.id));
    for (let day = 29; day <= 30; day++) {
      const item = remaining[day - 29] || null;
      plan.push({
        day_number: day,
        content_id: item?.id || null,
        content_type: item?.type || null,
        reason: item ? 'Capstone content to consolidate your learning' : null,
      });
    }

    await db.saveLearningPlan(skillId, plan);
    return db.getLearningPlan(skillId);
  }

  async getPlan(skillId) {
    const existing = await db.getLearningPlan(skillId);
    if (existing.length > 0) return existing;
    const allContent = await db.getSkillContent(skillId);
    if (allContent.length === 0) return [];
    return this.generatePlan(skillId);
  }

  // Get or generate the shared plan, then copy it into user_learning_plans
  async copyPlanForUser(userId, skillId) {
    // Ensure shared plan exists
    const sharedPlan = await this.getPlan(skillId);

    // Copy into user_learning_plans (replaces any existing entries)
    await db.saveUserLearningPlan(userId, skillId, sharedPlan.map(day => ({
      day_number: day.day_number,
      content_id: day.content_id,
      content_type: day.content_type,
      reason: day.reason,
    })));

    return db.getUserLearningPlan(userId, skillId);
  }

  // Get user's personal plan with smart refresh if new content was scraped
  async getUserPlanWithRefresh(userId, skillId) {
    const userPlan = await db.getUserLearningPlan(userId, skillId);
    if (userPlan.length === 0) return [];

    // Check if content has been refreshed since user plan was created
    const skill = await db.getSkillById(skillId);
    if (!skill || !skill.last_scraped_at) return userPlan;

    const maxCreatedAt = await db.getUserPlanMaxCreatedAt(userId, skillId);
    if (!maxCreatedAt || new Date(skill.last_scraped_at) <= new Date(maxCreatedAt)) {
      return userPlan;
    }

    // New content exists — refresh only incomplete days
    const progress = await db.getPlanProgress(userId, skillId);
    const completedDays = new Set(JSON.parse(progress?.completed_days || '[]'));

    // Regenerate a fresh shared plan to get updated content assignments
    const freshPlan = await this.generatePlan(skillId);

    // Only refresh days the user hasn't completed
    const daysToRefresh = freshPlan
      .filter(day => !completedDays.has(day.day_number))
      .map(day => ({
        day_number: day.day_number,
        content_id: day.content_id,
        content_type: day.content_type,
        reason: day.reason,
      }));

    if (daysToRefresh.length > 0) {
      await db.refreshUserPlanDays(userId, skillId, daysToRefresh);
    }

    return db.getUserLearningPlan(userId, skillId);
  }
}

module.exports = new LearningPlanService();
