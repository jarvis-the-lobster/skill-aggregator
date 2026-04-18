const { PostHog } = require('posthog-node');

let client = null;

if (process.env.POSTHOG_KEY) {
  client = new PostHog(process.env.POSTHOG_KEY, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  });
}

function track(distinctId, event, properties = {}) {
  if (!client) return;
  client.capture({ distinctId, event, properties });
}

function trackSkillSearched({ skillId, skillName, isNewSkill, url, distinctId }) {
  track(distinctId || 'anonymous-server', 'skill_searched', {
    skillId,
    skillName,
    isNewSkill,
    anonymous: !distinctId,
    ...(url && { $current_url: url }),
  });
}

function trackSkillContentServed({ skillId, skillName, videoCount, articleCount, url, distinctId }) {
  track(distinctId || 'anonymous-server', 'skill_content_served', {
    skillId,
    skillName,
    videoCount,
    articleCount,
    anonymous: !distinctId,
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

function trackCheckoutSessionRequested({ userId, url, source = 'billing' }) {
  track(`user_${userId}`, 'checkout_session_requested', {
    userId,
    source,
    ...(url && { $current_url: url }),
  });
}

function trackSubscriptionCancelled({ userId, url }) {
  track(`user_${userId}`, 'subscription_cancelled', {
    userId,
    ...(url && { $current_url: url }),
  });
}

function trackOnboardingCompleted({ userId, userType, goal, dailyTime, attributionSource, url }) {
  track(`user_${userId}`, 'onboarding_completed', {
    userId,
    userType,
    goal,
    dailyTime,
    attributionSource,
    ...(url && { $current_url: url }),
  });
}

module.exports = {
  trackSkillSearched,
  trackSkillContentServed,
  trackUserRegistered,
  trackUserLoggedIn,
  trackCheckoutSessionRequested,
  trackSubscriptionCancelled,
  trackOnboardingCompleted,
};
