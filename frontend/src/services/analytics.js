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
};

export default analytics;
