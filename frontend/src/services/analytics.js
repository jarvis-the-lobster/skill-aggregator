import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

if (key) {
  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // we track page views manually
    persistence: 'localStorage+cookie',
  });
}

const analytics = {
  track(event, properties = {}) {
    if (!key) return;
    try {
      posthog.capture(event, properties);
    } catch (e) {
      console.warn('[analytics] capture failed:', e.message);
    }
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
