const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';
const rateLimitMessage = { error: 'Too many requests, please try again later.' };
const skipInTest = isTest ? () => true : () => false;

// Auth endpoints: 10 req / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// General API: 100 req / 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// Skill search: 20 req / 15 min per IP (protects YouTube quota)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

// Bulk endpoint: 10 req / hour per IP
const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
  skip: skipInTest,
});

module.exports = { authLimiter, apiLimiter, searchLimiter, bulkLimiter };
