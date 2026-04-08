const db = require('../models/database');

// Quality score: views + rating weighted higher
function qualityScore(row) {
  return (row.views || 0) + (row.rating || 0) * 1000;
}

function buildEntry(day, item, reason) {
  return {
    day_number: day,
    content_id: item?.id || null,
    content_type: item?.type || null,
    reason: item ? reason : null,
  };
}

class LearningPlanService {
  pickNext(candidates, usedIds) {
    const item = candidates.find(candidate => candidate && !usedIds.has(candidate.id)) || null;
    if (item) usedIds.add(item.id);
    return item;
  }

  isPlanIncomplete(plan) {
    if (plan.length !== 30) return true;

    const dayNumbers = new Set(plan.map(day => day.day_number));
    for (let day = 1; day <= 30; day++) {
      if (!dayNumbers.has(day)) return true;
    }

    return plan.some(day => !day.content_id);
  }

  // Generate and persist a 30-day plan for a skill based on existing content
  async generatePlan(skillId) {
    const allContent = await db.getSkillContent(skillId);

    const videos = allContent
      .filter(r => r.type === 'video')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const articles = allContent
      .filter(r => r.type === 'article')
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const allRanked = [...videos, ...articles]
      .sort((a, b) => qualityScore(b) - qualityScore(a));

    const plan = [];
    const usedIds = new Set();

    // Days 1–7: prefer videos, fallback to best remaining content
    for (let day = 1; day <= 7; day++) {
      const item = this.pickNext(videos, usedIds) || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Top-ranked content to get you started'));
    }

    // Days 8–14: prefer articles, fallback to best remaining content
    for (let day = 8; day <= 14; day++) {
      const item = this.pickNext(articles, usedIds) || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Key content to reinforce week 1 concepts'));
    }

    // Days 15–21: prefer remaining videos, fallback to best remaining content
    for (let day = 15; day <= 21; day++) {
      const item = this.pickNext(videos, usedIds) || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Intermediate content to deepen understanding'));
    }

    // Days 22–28: prefer remaining articles, fallback to videos, then anything left
    for (let day = 22; day <= 28; day++) {
      const item = this.pickNext(articles, usedIds)
        || this.pickNext(videos, usedIds)
        || this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Advanced content to master the skill'));
    }

    // Days 29–30: best remaining content (capstone)
    for (let day = 29; day <= 30; day++) {
      const item = this.pickNext(allRanked, usedIds);
      plan.push(buildEntry(day, item, 'Capstone content to consolidate your learning'));
    }

    await db.saveLearningPlan(skillId, plan);
    return db.getLearningPlan(skillId);
  }

  async getPlan(skillId) {
    const existing = await db.getLearningPlan(skillId);
    if (existing.length > 0) {
      if (this.isPlanIncomplete(existing)) {
        const allContent = await db.getSkillContent(skillId);
        if (allContent.length > 0) {
          return this.generatePlan(skillId);
        }
      }
      return existing;
    }
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

  // Get user's personal plan, flagging if a refresh is available
  async getUserPlanWithRefresh(userId, skillId) {
    const userPlan = await db.getUserLearningPlan(userId, skillId);
    if (userPlan.length === 0) return { plan: [], refreshAvailable: false };

    // Check if content has been refreshed since user plan was created
    const skill = await db.getSkillById(skillId);
    if (!skill || !skill.last_scraped_at) return { plan: userPlan, refreshAvailable: false };

    const maxCreatedAt = await db.getUserPlanMaxCreatedAt(userId, skillId);
    const hasNewContent = maxCreatedAt && new Date(skill.last_scraped_at) > new Date(maxCreatedAt);

    return { plan: userPlan, refreshAvailable: hasNewContent };
  }

  // Actually apply the refresh — called when user opts in
  async refreshUserPlan(userId, skillId) {
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
