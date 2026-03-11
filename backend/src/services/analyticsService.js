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

function trackSkillSearched({ skillId, skillName, isNewSkill }) {
  track('server', 'skill_searched', { skillId, skillName, isNewSkill });
}

function trackSkillContentServed({ skillId, skillName, contentType, resultCount }) {
  track('server', 'skill_content_served', { skillId, skillName, contentType, resultCount });
}

function trackUserRegistered({ userId, method }) {
  track(`user_${userId}`, 'user_registered', { userId, method });
}

function trackUserLoggedIn({ userId, method }) {
  track(`user_${userId}`, 'user_logged_in', { userId, method });
}

module.exports = {
  trackSkillSearched,
  trackSkillContentServed,
  trackUserRegistered,
  trackUserLoggedIn,
};
