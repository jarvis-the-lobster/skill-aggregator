const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : () => false;
const rateLimitMessage = { error: 'Too many requests, please try again later.' };

// Key generator: use authenticated user ID when available, fall back to IP.
// This means authed users get their own bucket instead of sharing an IP pool.
function keyByUserOrIp(req) {
  return req.user?.id ? `user:${req.user.id}` : req.ip;
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
  max: (req) => (req.user ? 60 : 30),
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

// General API: 300 req / 15 min — applied per route group, not globally.
// Authed users get their own bucket via keyByUserOrIp.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
  validate: { keyGeneratorIpFallback: false },
});

module.exports = { authLimiter, searchLimiter, bulkLimiter, generalLimiter, keyByUserOrIp };
