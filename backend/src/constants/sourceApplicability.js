const FREECODECAMP_ALLOWED_CATEGORIES = new Set([
  'programming',
  'data',
  'ai',
  'devops',
  'security'
]);

function normalizeCategory(category) {
  return (category || '').trim().toLowerCase();
}

function getApplicableSources(category) {
  const normalized = normalizeCategory(category);
  const sources = new Set(['youtube', 'devto', 'medium']);

  if (FREECODECAMP_ALLOWED_CATEGORIES.has(normalized)) {
    sources.add('freecodecamp');
  }

  return sources;
}

function isSourceApplicable(source, category) {
  return getApplicableSources(category).has((source || '').trim().toLowerCase());
}

module.exports = {
  FREECODECAMP_ALLOWED_CATEGORIES,
  normalizeCategory,
  getApplicableSources,
  isSourceApplicable,
};
