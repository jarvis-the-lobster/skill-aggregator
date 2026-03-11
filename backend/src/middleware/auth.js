const { verifyToken } = require('../services/authService');
const db = require('../models/database');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.slice(7);
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
