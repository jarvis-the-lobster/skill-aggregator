const isServer = typeof window === 'undefined';

let posthogInstance = null;
let initialized = false;

function getPosthog() {
  return posthogInstance;
}

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
      });
      initialized = true;
    }
  });
}

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
  trackContentRated(contentId, skillId, rating) {
    this.track('content_rated', { contentId, skillId, rating });
  },
};

export default analytics;
