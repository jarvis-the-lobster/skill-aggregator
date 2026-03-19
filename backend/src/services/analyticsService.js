const { PostHog } = require('posthog-node');

let client = null;

if (process.env.POSTHOG_KEY) {
  client = new PostHog(process.env.POSTHOG_KEY, {
    host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
  });
}

function track(distinctId, event, properties = {}) {
  if (!client) return;
  client.capture({ distinctId, event, properties });
}

function trackSkillSearched({ skillId, skillName, isNewSkill, url, distinctId }) {
  track(distinctId || `skill_${skillId}` || 'server', 'skill_searched', {
    skillId,
    skillName,
    isNewSkill,
    ...(url && { $current_url: url }),
  });
}

function trackSkillContentServed({ skillId, skillName, videoCount, articleCount, url, distinctId }) {
  track(distinctId || `skill_${skillId}` || 'server', 'skill_content_served', {
    skillId,
    skillName,
    videoCount,
    articleCount,
    ...(url && { $current_url: url }),
  });
}

function trackUserRegistered({ userId, method, url }) {
  track(`user_${userId}`, 'user_registered', {
    userId,
    method,
    ...(url && { $current_url: url }),
  });
}

function trackUserLoggedIn({ userId, method, url }) {
  track(`user_${userId}`, 'user_logged_in', {
    userId,
    method,
    ...(url && { $current_url: url }),
  });
}

module.exports = {
  trackSkillSearched,
  trackSkillContentServed,
  trackUserRegistered,
  trackUserLoggedIn,
};
