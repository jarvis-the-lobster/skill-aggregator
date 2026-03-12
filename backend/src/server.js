require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Routes
const skillRoutes = require('./routes/skills');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const courseRoutes = require('./routes/courses');
const skillsService = require('./services/skillsService');
app.use('/api/skills', skillRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Skill Aggregator API - Making learning faster and smarter 🦞',
    endpoints: [
      'GET /api/health - Health check',
      'GET /api/skills - List all skills',
      'GET /api/skills/:skill - Get content for specific skill',
      'POST /api/skills/:skill/scrape - Trigger content scraping'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`🦞 Skill Aggregator API running on port ${PORT}`);
  console.log(`🌍 Health check: http://localhost:${PORT}/api/health`);

  // Seed MVP skills into DB (idempotent — safe to run every startup)
  setTimeout(() => {
    skillsService.seedMVPSkills().catch(err =>
      console.error('Failed to seed MVP skills:', err.message)
    );
  }, 500);
});