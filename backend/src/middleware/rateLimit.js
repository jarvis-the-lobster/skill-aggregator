const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const isTest = process.env.NODE_ENV === 'test';
const skipInTest = isTest ? () => true : () => false;
const rateLimitMessage = { error: 'Too many requests, please try again later.' };

// --- Tier detection --------------------------------------------------------

// Extract user ID from the Bearer token without a DB round-trip.
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

// Short-lived cache for subscription status lookups (userId → { status, expiresAt }).
// Avoids a DB call on every request while staying fresh enough for rate-limit purposes.
const tierCache = new Map();
const TIER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getUserTier(userId) {
  if (!userId) return 'anon';

  const cached = tierCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;

  try {
    const db = require('../models/database');
    const user = await db.getUserById(userId);
    const tier = user?.subscription_status === 'active' ? 'premium' : 'free';
    tierCache.set(userId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL });
    return tier;
  } catch {
    return 'free'; // fail open to free tier, not anon
  }
}

// Key generator: use authenticated user ID when available, fall back to IP.
function keyByUserOrIp(req) {
  const userId = req.user?.id ?? extractUserId(req);
  return userId ? `user:${userId}` : req.ip;
}

// --- Limiters --------------------------------------------------------------

// Auth endpoints (login/register): 15 req / 15 min per IP — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// Search: protects YouTube quota. Tiered by user state.
const SEARCH_MAX = { anon: 20, free: 40, premium: 60 };
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => {
    const tier = await getUserTier(extractUserId(req));
    return SEARCH_MAX[tier];
  },
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

// General API: tiered by user state, separate instance per route group.
const GENERAL_MAX = { anon: 100, free: 200, premium: 300 };
function createGeneralLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: async (req) => {
      const tier = await getUserTier(extractUserId(req));
      return GENERAL_MAX[tier];
    },
    keyGenerator: keyByUserOrIp,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    skip: skipInTest,
    validate: { keyGeneratorIpFallback: false },
  });
}

module.exports = {
  authLimiter, searchLimiter, bulkLimiter, createGeneralLimiter,
  keyByUserOrIp, extractUserId, getUserTier,
  // Exposed for testing
  _tierCache: tierCache, GENERAL_MAX, SEARCH_MAX,
};
