const { verifyToken } = require('../services/authService');
const db = require('../models/database');

async function requireAuth(req, res, next) {
  // Prefer httpOnly cookie; fall back to Authorization header for backwards compat
  let token = req.cookies?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

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

module.exports = { requireAuth };
