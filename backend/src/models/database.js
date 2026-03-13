const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../database/skills.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('📊 Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  // Initialize database tables
  initializeTables() {
    const tables = [
      // Skills table
      `CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        difficulty TEXT,
        description TEXT,
        estimated_hours INTEGER,
        last_scraped_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Content table for videos, articles, courses
      `CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        skill_id TEXT,
        type TEXT, -- 'video', 'article', 'course'
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT,
        author TEXT,
        thumbnail TEXT,
        duration TEXT,
        views INTEGER,
        likes INTEGER DEFAULT 0,
        rating REAL,
        published_date DATE,
        description TEXT,
        read_time TEXT,
        tags TEXT, -- JSON array as string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skills (id)
      )`,

      // User interactions (for future features)
      `CREATE TABLE IF NOT EXISTS user_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id TEXT,
        interaction_type TEXT, -- 'view', 'like', 'complete'
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (content_id) REFERENCES content (id)
      )`,

      // Users table for authentication
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        name TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )`,

      // Scrape log table for ops metrics
      `CREATE TABLE IF NOT EXISTS scrape_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        items_fetched INTEGER DEFAULT 0,
        error_message TEXT,
        quota_used INTEGER DEFAULT 0,
        duration_ms INTEGER,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // User course enrollments
      `CREATE TABLE IF NOT EXISTS user_courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        skill_id TEXT NOT NULL,
        enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        last_activity_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        UNIQUE(user_id, skill_id)
      )`,

      // Newsletter subscribers
      `CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        skill_categories TEXT,
        confirmed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 30-day learning plans
      `CREATE TABLE IF NOT EXISTS learning_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        content_id TEXT,
        content_type TEXT,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (content_id) REFERENCES content(id)
      )`
    ];

    this.db.serialize(() => {
      tables.forEach((sql, index) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error(`Error creating table ${index}:`, err.message);
          }
        });
      });

      // Migrations: add columns that may not exist in older DBs
      const migrations = [
        'ALTER TABLE skills ADD COLUMN last_scraped_at DATETIME',
        'ALTER TABLE content ADD COLUMN likes INTEGER DEFAULT 0',
        "ALTER TABLE skills ADD COLUMN status TEXT DEFAULT 'pending'"
      ];
      migrations.forEach(sql => {
        this.db.run(sql, (err) => {
          // Ignore "duplicate column" errors — expected when column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error:', err.message);
          }
        });
      });
    });
  }

  // Generic query method
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Insert/update method
  insert(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  // Get all skills
  async getSkills() {
    return this.query('SELECT * FROM skills ORDER BY name');
  }

  // Get a single skill by ID
  async getSkillById(id) {
    const rows = await this.query('SELECT * FROM skills WHERE id = ?', [id]);
    return rows[0] || null;
  }

  // Update skill status
  async updateSkillStatus(id, status) {
    return this.insert('UPDATE skills SET status = ? WHERE id = ?', [status, id]);
  }

  // Get content for a skill, ordered by quality signals
  async getSkillContent(skillId, type = null) {
    let sql = 'SELECT * FROM content WHERE skill_id = ?';
    let params = [skillId];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY views DESC, published_date DESC';
    return this.query(sql, params);
  }

  // Save scraped content with deduplication (INSERT OR REPLACE on primary key)
  async saveContent(contentArray, skillId) {
    const sql = `
      INSERT OR REPLACE INTO content
      (id, skill_id, type, title, url, source, author, thumbnail,
       duration, views, likes, rating, published_date, description, read_time, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const promises = contentArray.map(item => {
      const params = [
        item.id,
        skillId,
        item.type || 'video',
        item.title,
        item.url,
        item.source,
        item.author || item.channel,
        item.thumbnail,
        item.duration,
        item.views || null,
        item.likes || null,
        item.rating || null,
        item.publishedDate,
        item.description || item.excerpt,
        item.readTime || item.read_time,
        JSON.stringify(item.tags || [])
      ];
      return this.insert(sql, params);
    });

    return Promise.all(promises);
  }

  // Update last_scraped_at timestamp for a skill
  async updateSkillLastScraped(skillId) {
    return this.insert('UPDATE skills SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?', [skillId]);
  }

  // --- Scrape log methods ---

  async logScrape({ skill_id, source, status, items_fetched = 0, error_message = null, quota_used = 0, duration_ms = null }) {
    return this.insert(
      `INSERT INTO scrape_log (skill_id, source, status, items_fetched, error_message, quota_used, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [skill_id, source, status, items_fetched, error_message, quota_used, duration_ms]
    );
  }

  async getMetrics() {
    const [scrapeStats, skillHealth, youtubeQuotaToday, recentErrors, contentCounts] = await Promise.all([
      // scrapeStats: success/error/quota_exceeded counts per source, last 7 days
      this.query(`
        SELECT source,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN status = 'quota_exceeded' THEN 1 ELSE 0 END) as quota_exceeded
        FROM scrape_log
        WHERE scraped_at >= datetime('now', '-7 days')
        GROUP BY source
      `),
      // skillHealth: last scraped, content count, last scrape status per skill
      this.query(`
        SELECT s.id as skill_id, s.name, s.last_scraped_at,
          COUNT(c.id) as content_count,
          (SELECT status FROM scrape_log WHERE skill_id = s.id ORDER BY scraped_at DESC LIMIT 1) as last_scrape_status
        FROM skills s
        LEFT JOIN content c ON c.skill_id = s.id
        GROUP BY s.id
        ORDER BY s.name
      `),
      // YouTube quota used today
      this.query(`
        SELECT COALESCE(SUM(quota_used), 0) as quota_used_today
        FROM scrape_log
        WHERE source = 'youtube' AND scraped_at >= date('now')
      `),
      // recentErrors: last 10 error rows
      this.query(`
        SELECT skill_id, source, error_message, scraped_at
        FROM scrape_log
        WHERE status IN ('error', 'quota_exceeded')
        ORDER BY scraped_at DESC
        LIMIT 10
      `),
      // contentCounts: total items per type per skill
      this.query(`
        SELECT skill_id, type, COUNT(*) as count
        FROM content
        GROUP BY skill_id, type
        ORDER BY skill_id, type
      `)
    ]);

    const quotaUsedToday = youtubeQuotaToday[0]?.quota_used_today || 0;
    const YOUTUBE_DAILY_LIMIT = 10000;

    return {
      scrapeStats,
      skillHealth,
      youtubeQuota: {
        used: quotaUsedToday,
        limit: YOUTUBE_DAILY_LIMIT,
        percentUsed: Math.round((quotaUsedToday / YOUTUBE_DAILY_LIMIT) * 100)
      },
      recentErrors,
      contentCounts
    };
  }

  // --- User methods ---

  async createUser({ email, password_hash = null, google_id = null, name = null, avatar_url = null }) {
    const result = await this.insert(
      `INSERT INTO users (email, password_hash, google_id, name, avatar_url)
       VALUES (?, ?, ?, ?, ?)`,
      [email, password_hash, google_id, name, avatar_url]
    );
    return this.getUserById(result.id);
  }

  async getUserByEmail(email) {
    const rows = await this.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  }

  async getUserById(id) {
    const rows = await this.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async getUserByGoogleId(googleId) {
    const rows = await this.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    return rows[0] || null;
  }

  async updateLastLogin(id) {
    return this.insert('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }

  // --- Course enrollment methods ---

  async enrollCourse(userId, skillId) {
    await this.insert(
      `INSERT OR IGNORE INTO user_courses (user_id, skill_id) VALUES (?, ?)`,
      [userId, skillId]
    );
    const rows = await this.query(
      'SELECT * FROM user_courses WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    return rows[0] || null;
  }

  async unenrollCourse(userId, skillId) {
    return this.insert(
      'DELETE FROM user_courses WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
  }

  async getMyCourses(userId) {
    return this.query(
      `SELECT uc.id, uc.skill_id, uc.enrolled_at, uc.status, uc.last_activity_at,
              s.name, s.category, s.difficulty, s.description, s.estimated_hours,
              (SELECT COUNT(*) FROM content c WHERE c.skill_id = s.id) as content_count
       FROM user_courses uc
       JOIN skills s ON s.id = uc.skill_id
       WHERE uc.user_id = ?
       ORDER BY uc.enrolled_at DESC`,
      [userId]
    );
  }

  async getCourseEnrollment(userId, skillId) {
    const rows = await this.query(
      'SELECT * FROM user_courses WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    return rows[0] || null;
  }

  async updateCourseStatus(userId, skillId, status) {
    return this.insert(
      `UPDATE user_courses SET status = ?, last_activity_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND skill_id = ?`,
      [status, userId, skillId]
    );
  }

  // --- Newsletter subscriber methods ---

  async addSubscriber(email, skillCategories = null) {
    const categoriesJson = skillCategories ? JSON.stringify(skillCategories) : null;
    return this.insert(
      `INSERT OR IGNORE INTO subscribers (email, skill_categories) VALUES (?, ?)`,
      [email, categoriesJson]
    );
  }

  async getSubscriberCount() {
    const rows = await this.query('SELECT COUNT(*) as count FROM subscribers');
    return rows[0]?.count || 0;
  }

  // --- Learning plan methods ---

  async getLearningPlan(skillId) {
    return this.query(
      `SELECT lp.day_number, lp.content_id, lp.content_type, lp.reason,
              c.title, c.url, c.thumbnail, c.duration, c.author, c.source
       FROM learning_plans lp
       LEFT JOIN content c ON c.id = lp.content_id
       WHERE lp.skill_id = ?
       ORDER BY lp.day_number ASC`,
      [skillId]
    );
  }

  async saveLearningPlan(skillId, days) {
    await this.insert('DELETE FROM learning_plans WHERE skill_id = ?', [skillId]);
    for (const entry of days) {
      await this.insert(
        `INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason)
         VALUES (?, ?, ?, ?, ?)`,
        [skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null]
      );
    }
  }

  // Close database connection
  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed');
        resolve();
      });
    });
  }
}

module.exports = new Database();
