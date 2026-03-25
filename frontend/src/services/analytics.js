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
        capture_pageview: false, // we track page views manually
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
