const { verifyToken } = require('../services/authService');
const db = require('../models/database');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(token);
    const user = await db.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const { password_hash, ...safe } = user;
    req.user = safe;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = await db.getUserById(payload.userId);
      if (user) {
        const { password_hash, ...safe } = user;
        req.user = safe;
      }
    } catch {
      // ignore invalid tokens — treat as anonymous
    }
  }
  next();
}

function requirePremium(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.subscription_status !== 'active') {
    return res.status(403).json({ error: 'Premium subscription required' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requirePremium };
