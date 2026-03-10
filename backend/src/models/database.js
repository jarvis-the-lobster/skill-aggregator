const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, '../../database/skills.db');
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
        views TEXT,
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

    tables.forEach((sql, index) => {
      this.db.run(sql, (err) => {
        if (err) {
          console.error(`Error creating table ${index}:`, err.message);
        } else {
          console.log(`✅ Table ${index + 1} initialized`);
        }
      });
    });
  }

  // Generic query method
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Insert method
  insert(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Get all skills
  async getSkills() {
    return this.query('SELECT * FROM skills ORDER BY name');
  }

  // Get content for a skill
  async getSkillContent(skillId, type = null) {
    let sql = 'SELECT * FROM content WHERE skill_id = ?';
    let params = [skillId];
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY rating DESC, views DESC';
    return this.query(sql, params);
  }

  // Save scraped content
  async saveContent(contentArray, skillId) {
    const insertSql = `
      INSERT OR REPLACE INTO content 
      (id, skill_id, type, title, url, source, author, thumbnail, 
       duration, views, rating, published_date, description, read_time, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        item.views,
        item.rating,
        item.publishedDate,
        item.description || item.excerpt,
        item.readTime,
        JSON.stringify(item.tags || [])
      ];
      
      return this.insert(insertSql, params);
    });

    return Promise.all(promises);
  }

  // Close database connection
  close() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
        resolve();
      });
    });
  }
}

module.exports = new Database();