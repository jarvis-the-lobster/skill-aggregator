const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');

// IMPORTANT: JWT_SECRET must be changed to a strong random value in production
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

async function register(email, password, name) {
  const existing = await db.getUserByEmail(email);
  if (existing) {
    throw new Error('Email already in use');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await db.createUser({ email, password_hash, name });
  await db.updateLastLogin(user.id);

  const token = generateToken(user.id);
  return { token, user: safeUser(user) };
}

async function login(email, password) {
  const user = await db.getUserByEmail(email);
  if (!user || !user.password_hash) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  await db.updateLastLogin(user.id);
  const token = generateToken(user.id);
  return { token, user: safeUser(user) };
}

module.exports = { register, login, generateToken, verifyToken, safeUser };
