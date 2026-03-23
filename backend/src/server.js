const app = require('./app');
const skillsService = require('./services/skillsService');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 LearnStack API running on port ${PORT}`);
  console.log(`🌍 Health check: http://localhost:${PORT}/api/health`);

  // Seed MVP skills into DB (idempotent — safe to run every startup)
  setTimeout(() => {
    skillsService.seedMVPSkills().catch(err =>
      console.error('Failed to seed MVP skills:', err.message)
    );
  }, 500);
});
