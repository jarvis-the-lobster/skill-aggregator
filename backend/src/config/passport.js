const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const { generateToken, safeUser } = require('../services/authService');

passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.password_hash) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Only register Google strategy when real credentials are provided
if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CLIENT_SECRET !== 'YOUR_GOOGLE_CLIENT_SECRET'
) {
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find existing user by google_id
      let user = await db.getUserByGoogleId(profile.id);

      if (!user) {
        // Check if an account with this email already exists
        const email = profile.emails?.[0]?.value;
        if (email) {
          user = await db.getUserByEmail(email);
        }

        if (user) {
          // Link google_id to existing account
          await db.insert('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?', [
            profile.id,
            profile.photos?.[0]?.value || null,
            user.id
          ]);
          user = await db.getUserById(user.id);
        } else {
          // Create new user
          user = await db.createUser({
            email: email || `google_${profile.id}@placeholder.invalid`,
            google_id: profile.id,
            name: profile.displayName,
            avatar_url: profile.photos?.[0]?.value || null
          });
        }
      }

      await db.updateLastLogin(user.id);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));
} // end Google strategy guard

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.getUserById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
