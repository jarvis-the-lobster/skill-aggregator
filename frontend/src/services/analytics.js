import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

if (key) {
  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // we track page views manually
  });
}

const analytics = {
  track(event, properties = {}) {
    if (!key) return;
    posthog.capture(event, properties);
  },
  identify(userId, traits = {}) {
    if (!key) return;
    posthog.identify(String(userId), traits);
  },
  reset() {
    if (!key) return;
    posthog.reset(); // call on logout to unlink the session
  },
  trackContentRated(contentId, skillId, rating) {
    this.track('content_rated', { contentId, skillId, rating });
  },
};

export default analytics;
