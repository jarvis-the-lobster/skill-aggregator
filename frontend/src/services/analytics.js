/**
 * LearnStack Analytics — PostHog wrapper
 *
 * Centralizes all frontend analytics calls so we have a single source of truth
 * for event names, properties, and PostHog configuration.
 *
 * Uses a lazy-init object API that is safe for SSR/prerendering (guards on
 * `typeof window`).
 */

const isServer = typeof window === 'undefined';

let posthogInstance = null;
let initialized = false;

function getPosthog() {
  return posthogInstance;
}

// ─── UTM helpers ─────────────────────────────────────────────────────────────

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const UTM_STORAGE_KEY = 'ls_utm_params';

/**
 * Capture UTM parameters from the current URL and persist them in
 * sessionStorage so they survive navigation. Only captures on first visit
 * (i.e. when nothing is stored yet).
 */
function captureUtmParams() {
  if (isServer) return;
  // Don't overwrite if we already captured UTMs this session
  if (sessionStorage.getItem(UTM_STORAGE_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const utm = {};
  let hasAny = false;

  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (val) {
      utm[key] = val;
      hasAny = true;
    }
  }

  if (hasAny) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  }
}

/**
 * Return stored UTM properties (or empty object).
 * Merge these into conversion events for attribution.
 */
function getUtmProperties() {
  if (isServer) return {};
  try {
    return JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

// Dynamically load and init posthog (client-side only)
if (!isServer) {
  import('posthog-js').then(mod => {
    posthogInstance = mod.default;
    const key = import.meta.env.VITE_POSTHOG_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
    if (key) {
      posthogInstance.init(key, {
        api_host: host,
        capture_pageview: true, // auto-track $pageview for PostHog built-in dashboards
        persistence: 'localStorage+cookie',
        autocapture: false,
        person_profiles: 'always', // create profiles for anonymous visitors (needed for DAU/WAU)
      });
      initialized = true;
      // Capture UTM params from the landing URL before any navigation occurs
      captureUtmParams();
    }
  });
}

// ─── Core API ────────────────────────────────────────────────────────────────

const analytics = {
  track(event, properties = {}) {
    if (!initialized) return;
    try {
      getPosthog()?.capture(event, properties);
    } catch (e) {
      console.warn('[analytics] capture failed:', e.message);
    }
  },

  identify(userId, traits = {}) {
    if (!initialized) return;
    getPosthog()?.identify(String(userId), traits);
  },

  reset() {
    if (!initialized) return;
    getPosthog()?.reset(); // call on logout to unlink the session
  },

  // ─── Page views ────────────────────────────────────────────────────────────

  trackPageView(pageName, properties = {}) {
    this.track('page_view', { page: pageName, ...properties });
  },

  // ─── Home ──────────────────────────────────────────────────────────────────

  homepageViewed(properties = {}) {
    this.track('homepage_viewed', properties);
  },

  // ─── Auth pages ────────────────────────────────────────────────────────────

  signupPageViewed() {
    this.track('signup_page_viewed');
  },

  loginPageViewed() {
    this.track('login_page_viewed');
  },

  /**
   * Call immediately after registration completes so PostHog links the
   * anonymous session to the new user before navigating away.
   * Also fires user_signed_up with UTM attribution.
   */
  userSignedUp(userId, { email, name } = {}) {
    this.identify(userId, { email, name });
    this.track('user_signed_up', {
      email,
      name,
      ...getUtmProperties(),
    });
  },

  // ─── Search ────────────────────────────────────────────────────────────────

  searchQueryTyped(query, resultCount) {
    this.track('search_query_typed', { query, ...(resultCount !== undefined && { resultCount }) });
  },

  // ─── Skill cards / discovery ───────────────────────────────────────────────

  skillCardClicked(skillId, skillTitle) {
    this.track('skill_card_clicked', { skill_id: skillId, skill_title: skillTitle, skillId, skillName: skillTitle });
  },

  // ─── Content / skill page ──────────────────────────────────────────────────

  contentTabSwitched(tab, skillId) {
    this.track('content_tab_switched', { tab, skill_id: skillId, skillId });
  },

  trackContentRated(contentId, skillId, rating) {
    this.track('content_rated', { contentId, skillId, content_id: contentId, skill_id: skillId, rating });
  },

  contentLinkClicked(skillId, contentId, type, url) {
    this.track('content_link_clicked', {
      skill_id: skillId,
      content_id: contentId,
      type,
      url,
    });
  },

  // ─── Enrollment ────────────────────────────────────────────────────────────

  /**
   * Track course enrollment with UTM attribution.
   */
  courseEnrolled(skillId) {
    this.track('course_enrolled', {
      skill_id: skillId,
      ...getUtmProperties(),
    });
  },

  // ─── Onboarding funnel ─────────────────────────────────────────────────────

  onboardingStarted() {
    this.track('onboarding_started');
  },

  onboardingStepCompleted(step, value) {
    this.track('onboarding_step_completed', { step, value });
  },

  onboardingCompleted() {
    this.track('onboarding_completed');
  },

  onboardingSkipped() {
    this.track('onboarding_skipped');
  },

  // ─── Learning plan engagement ──────────────────────────────────────────────

  planViewed(skillId) {
    this.track('plan_viewed', { skill_id: skillId });
  },

  planDayCompleted(dayNumber, skillId) {
    this.track('plan_day_completed', { day_number: dayNumber, skill_id: skillId });
  },

  // ─── Page-specific views ──────────────────────────────────────────────────

  pageViewed(pageName, properties = {}) {
    this.track('page_viewed', { page: pageName, ...properties });
  },

  skillPageViewed(skillId, skillName, properties = {}) {
    this.track('skill_page_viewed', { skill_id: skillId, skill_name: skillName, ...properties });
  },

  learningPlanViewed(skillId, properties = {}) {
    this.track('learning_plan_viewed', { skill_id: skillId, ...properties });
  },

  learningPlanEnrolled(skillId, properties = {}) {
    this.track('learning_plan_enrolled', { skill_id: skillId, ...getUtmProperties(), ...properties });
  },

  learningPlanRefreshed(skillId, properties = {}) {
    this.track('learning_plan_refreshed', { skill_id: skillId, ...properties });
  },

  premiumPlanMerged(skillId, properties = {}) {
    this.track('premium_plan_merged', { skill_id: skillId, ...properties });
  },

  reviewOpened(skillId, dayNumber, properties = {}) {
    this.track('review_opened', { skill_id: skillId, day_number: dayNumber, ...properties });
  },

  reviewSubmitted(skillId, dayNumber, properties = {}) {
    this.track('review_submitted', { skill_id: skillId, day_number: dayNumber, ...properties });
  },

  premiumPageViewed(properties = {}) {
    this.track('premium_page_viewed', { ...properties });
  },

  premiumCheckoutStarted(source, properties = {}) {
    this.track('premium_checkout_started', { source, ...properties });
  },

  premiumCheckoutSucceeded(properties = {}) {
    this.track('premium_checkout_succeeded', { ...getUtmProperties(), ...properties });
  },

  accountPageViewed(properties = {}) {
    this.track('account_page_viewed', { ...properties });
  },

  myCoursesViewed(courseCount, properties = {}) {
    this.track('my_courses_viewed', { course_count: courseCount, ...properties });
  },

  aboutPageViewed(properties = {}) {
    this.track('about_page_viewed', { ...properties });
  },

  premiumSuccessViewed(properties = {}) {
    this.track('premium_success_viewed', { ...getUtmProperties(), ...properties });
  },

  authCallbackViewed(properties = {}) {
    this.track('auth_callback_viewed', { ...properties });
  },

  // ─── Notifications ────────────────────────────────────────────────────────

  notificationBellOpened(unreadCount) {
    this.track('notification_bell_opened', { unread_count: unreadCount });
  },

  notificationMarkedRead(notificationId, properties = {}) {
    this.track('notification_marked_read', { notification_id: notificationId, ...properties });
  },

  notificationsMarkedAllRead(count, properties = {}) {
    this.track('notifications_marked_all_read', { count, ...properties });
  },

  // ─── Push opt-in ──────────────────────────────────────────────────────────

  pushOptInShown(properties = {}) {
    // Dedupe: only fire once per session
    if (!isServer && !sessionStorage.getItem('_ph_push_optin_shown')) {
      sessionStorage.setItem('_ph_push_optin_shown', '1');
      this.track('push_optin_shown', { ...properties });
    }
  },

  pushOptInDismissed(properties = {}) {
    this.track('push_optin_dismissed', { ...properties });
  },

  pushOptInEnabled(properties = {}) {
    this.track('push_optin_enabled', { ...properties });
  },

  // ─── Onboarding ───────────────────────────────────────────────────────────

  onboardingSkillSelected(skillId, properties = {}) {
    this.track('onboarding_skill_selected', { skill_id: skillId, ...properties });
  },

  onboardingPremiumPitchViewed(properties = {}) {
    this.track('onboarding_premium_pitch_viewed', { ...properties });
  },

  onboardingTrialStarted(properties = {}) {
    this.track('onboarding_trial_started', { ...getUtmProperties(), ...properties });
  },

  onboardingPremiumSkipped(properties = {}) {
    this.track('onboarding_premium_skipped', { ...properties });
  },

  // ─── Search ───────────────────────────────────────────────────────────────

  searchSuggestionClicked(skillId, skillName, properties = {}) {
    this.track('search_suggestion_clicked', { skill_id: skillId, skill_name: skillName, ...properties });
  },

  searchSubmitted(query, properties = {}) {
    this.track('search_submitted', { query, ...properties });
  },

  // ─── Newsletter / Early Access ─────────────────────────────────────────────

  earlyAccessViewed() {
    this.track('early_access_viewed');
  },

  /**
   * Track successful newsletter subscription with UTM attribution.
   */
  newsletterSubscribed(email) {
    this.track('newsletter_subscribed', {
      email,
      ...getUtmProperties(),
    });
  },
};

export default analytics;

