const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : () => false;
const rateLimitMessage = { error: 'Too many requests, please try again later.' };

// Extract user ID from the Bearer token without a DB round-trip.
// Returns null if the token is missing, malformed, or expired.
function extractUserId(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

// Key generator: use authenticated user ID when available, fall back to IP.
function keyByUserOrIp(req) {
  const userId = req.user?.id ?? extractUserId(req);
  return userId ? `user:${userId}` : req.ip;
}

// Auth endpoints (login/register): 15 req / 15 min per IP — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// Search: 30 req / 15 min anon, 60 authed — protects YouTube quota
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (extractUserId(req) ? 60 : 30),
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
  validate: { keyGeneratorIpFallback: false },
});

// Bulk endpoint: 10 req / hour per IP (unchanged)
const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// Factory: creates a fresh limiter instance so each route group gets its own
// counter store instead of sharing one global bucket.
function createGeneralLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    keyGenerator: keyByUserOrIp,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    skip: skipInTest,
    validate: { keyGeneratorIpFallback: false },
  });
}

module.exports = { authLimiter, searchLimiter, bulkLimiter, createGeneralLimiter, keyByUserOrIp, extractUserId };
