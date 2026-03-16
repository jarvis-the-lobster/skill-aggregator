const db = require('../models/database');
const skills = require('../data/skills-seed');

async function importSkills() {
  let imported = 0;
  let skipped = 0;

  for (const skill of skills) {
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT OR IGNORE INTO skills (id, name, category, difficulty, description, estimated_hours)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [skill.id, skill.name, skill.category, skill.difficulty, skill.description, skill.estimatedHours],
        function (err) {
          if (err) return reject(err);
          if (this.changes > 0) {
            imported++;
          } else {
            skipped++;
          }
          resolve();
        }
      );
    });
  }

  console.log(`Imported ${imported} new skills, skipped ${skipped} existing`);
  db.close();
}

importSkills().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
