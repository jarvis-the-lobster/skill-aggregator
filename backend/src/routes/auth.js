const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { register, login, generateToken, safeUser } = require('../services/authService');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const result = await register(email, password, name);
    res.status(201).json(result);
  } catch (err) {
    if (err.message === 'Email already in use') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    if (err.message === 'Invalid email or password') {
      return res.status(401).json({ error: err.message });
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout  (stateless JWT — client drops the token)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

// GET /api/auth/google
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    return res.status(503).json({ error: 'Google OAuth is not configured yet' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth`);
  }
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth`
  })(req, res, next);
}, (req, res) => {
  const token = generateToken(req.user.id);
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
});

module.exports = router;
