const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, '../../../database/skills.db');
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
        'ALTER TABLE content ADD COLUMN likes INTEGER DEFAULT 0'
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
    return this.insert(
      'INSERT OR REPLACE INTO skills (id, last_scraped_at) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_scraped_at = CURRENT_TIMESTAMP',
      [skillId]
    ).catch(() =>
      // Fallback for older SQLite without ON CONFLICT DO UPDATE
      this.insert('UPDATE skills SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?', [skillId])
    );
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
