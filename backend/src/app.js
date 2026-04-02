require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');

const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);

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
const newsletterRoutes = require('./routes/newsletter');
const learningPlanRoutes = require('./routes/learningPlans');
const ratingsRoutes = require('./routes/ratings');
const streakRoutes = require('./routes/streaks');
const pushRoutes = require('./routes/push');
const onboardingRoutes = require('./routes/onboarding');
app.use('/api/skills', skillRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/learning-plans', learningPlanRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/streaks', streakRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Global rate limit on /api (applied after specific route limiters)
app.use('/api', apiLimiter);

// Sitemap
const sitemapDb = require('./models/database');
app.get('/api/sitemap.xml', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://learnstack.dev';
  try {
    const skills = await sitemapDb.getSkills();

    const staticPages = [
      { loc: '/', changefreq: 'daily', priority: '1.0' },
      { loc: '/about', changefreq: 'monthly', priority: '0.5' },
      { loc: '/early-access', changefreq: 'weekly', priority: '0.6' },
      { loc: '/login', changefreq: 'monthly', priority: '0.3' },
      { loc: '/signup', changefreq: 'monthly', priority: '0.3' },
    ];

    const urls = staticPages.map(
      (p) =>
        `  <url>\n    <loc>${frontendUrl}${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    );

    for (const skill of skills) {
      const lastmod = skill.last_scraped_at
        ? `\n    <lastmod>${new Date(skill.last_scraped_at + 'Z').toISOString().split('T')[0]}</lastmod>`
        : '';
      urls.push(
        `  <url>\n    <loc>${frontendUrl}/skills/${skill.id}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
      );
      urls.push(
        `  <url>\n    <loc>${frontendUrl}/skills/${skill.id}/plan</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err.message);
    res.status(500).set('Content-Type', 'application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

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
    message: 'LearnStack API - Making learning faster and smarter 🚀',
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

module.exports = app;
