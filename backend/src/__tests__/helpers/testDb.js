const sqlite3 = require('sqlite3').verbose();

const TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    difficulty TEXT,
    description TEXT,
    estimated_hours INTEGER,
    last_scraped_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending'
  )`,
  `CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    skill_id TEXT,
    type TEXT,
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
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skills (id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT,
    interaction_type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    FOREIGN KEY (content_id) REFERENCES content (id)
  )`,
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
  `CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    skill_categories TEXT,
    confirmed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
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
  )`,
  `CREATE TABLE IF NOT EXISTS user_plan_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_days TEXT DEFAULT '[]',
    last_activity_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    UNIQUE(user_id, skill_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_streaks (
    user_id INTEGER NOT NULL UNIQUE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date TEXT,
    freeze_available INTEGER DEFAULT 1,
    freeze_last_used_date TEXT,
    freeze_last_recharged_date TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, endpoint)
  )`,
  `CREATE TABLE IF NOT EXISTS user_onboarding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    user_type TEXT NOT NULL,
    goal TEXT NOT NULL,
    daily_time TEXT NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
];

const INDEX_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_content_skill_id ON content(skill_id)',
  'CREATE INDEX IF NOT EXISTS idx_interactions_content_id ON user_interactions(content_id)',
  'CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON user_interactions(user_id)',
];

function createTestDb() {
  return new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);

      function query(sql, params = []) {
        return new Promise((res, rej) => {
          raw.all(sql, params, (e, rows) => (e ? rej(e) : res(rows)));
        });
      }

      function insert(sql, params = []) {
        return new Promise((res, rej) => {
          raw.run(sql, params, function (e) {
            if (e) rej(e);
            else res({ id: this.lastID, changes: this.changes });
          });
        });
      }

      const db = {
        query,
        insert,

        async getSkills() {
          return query('SELECT * FROM skills ORDER BY name');
        },

        async getSkillById(id) {
          const rows = await query('SELECT * FROM skills WHERE id = ?', [id]);
          return rows[0] || null;
        },

        async updateSkillStatus(id, status) {
          return insert('UPDATE skills SET status = ? WHERE id = ?', [status, id]);
        },

        async getSkillContent(skillId, type = null) {
          let sql = `
            SELECT c.*,
                   COALESCE(v.thumbs_up, 0) as thumbs_up,
                   COALESCE(v.thumbs_down, 0) as thumbs_down
            FROM content c
            LEFT JOIN (
              SELECT content_id,
                     SUM(CASE WHEN interaction_type = 'thumbs_up' THEN 1 ELSE 0 END) as thumbs_up,
                     SUM(CASE WHEN interaction_type = 'thumbs_down' THEN 1 ELSE 0 END) as thumbs_down
              FROM user_interactions
              WHERE interaction_type IN ('thumbs_up', 'thumbs_down')
              GROUP BY content_id
            ) v ON v.content_id = c.id
            WHERE c.skill_id = ?
          `;
          const params = [skillId];
          if (type) {
            sql += ' AND c.type = ?';
            params.push(type);
          }
          sql += ` AND NOT (
            c.type = 'video' AND (
              (c.duration IS NOT NULL
               AND c.duration NOT LIKE '%:%:%'
               AND CAST(SUBSTR(c.duration, 1, INSTR(c.duration, ':') - 1) AS INTEGER) < 3)
              OR LOWER(c.title) LIKE '%#short%'
              OR LOWER(c.title) LIKE '%shorts%'
              OR LOWER(c.title) LIKE '%meme%'
              OR LOWER(c.title) LIKE '%compilation%'
              OR LOWER(c.title) LIKE '%reaction%'
            )
          )`;
          sql += ' ORDER BY (COALESCE(v.thumbs_up, 0) - COALESCE(v.thumbs_down, 0)) * 1000 + COALESCE(c.views, 0) DESC';
          return query(sql, params);
        },

        async saveContent(contentArray, skillId) {
          const sql = `
            INSERT OR REPLACE INTO content
            (id, skill_id, type, title, url, source, author, thumbnail,
             duration, views, likes, rating, published_date, description, read_time, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const promises = contentArray.map((item) => {
            const params = [
              item.id, skillId, item.type || 'video', item.title, item.url,
              item.source, item.author || item.channel, item.thumbnail,
              item.duration, item.views || null, item.likes || null,
              item.rating || null, item.publishedDate,
              item.description || item.excerpt, item.readTime || item.read_time,
              JSON.stringify(item.tags || []),
            ];
            return insert(sql, params);
          });
          return Promise.all(promises);
        },

        async updateSkillLastScraped(skillId) {
          return insert('UPDATE skills SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?', [skillId]);
        },

        async createUser({ email, password_hash = null, google_id = null, name = null, avatar_url = null }) {
          const result = await insert(
            'INSERT INTO users (email, password_hash, google_id, name, avatar_url) VALUES (?, ?, ?, ?, ?)',
            [email, password_hash, google_id, name, avatar_url]
          );
          return db.getUserById(result.id);
        },

        async getUserByEmail(email) {
          const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
          return rows[0] || null;
        },

        async getUserById(id) {
          const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
          return rows[0] || null;
        },

        async getUserByGoogleId(googleId) {
          const rows = await query('SELECT * FROM users WHERE google_id = ?', [googleId]);
          return rows[0] || null;
        },

        async updateLastLogin(id) {
          return insert('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        },

        async enrollCourse(userId, skillId) {
          await insert('INSERT OR IGNORE INTO user_courses (user_id, skill_id) VALUES (?, ?)', [userId, skillId]);
          const rows = await query('SELECT * FROM user_courses WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
          return rows[0] || null;
        },

        async unenrollCourse(userId, skillId) {
          return insert('DELETE FROM user_courses WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
        },

        async getMyCourses(userId) {
          return query(
            `SELECT uc.id, uc.skill_id, uc.enrolled_at, uc.status, uc.last_activity_at,
                    s.name, s.category, s.difficulty, s.description, s.estimated_hours,
                    (SELECT COUNT(*) FROM content c WHERE c.skill_id = s.id) as content_count
             FROM user_courses uc
             JOIN skills s ON s.id = uc.skill_id
             WHERE uc.user_id = ?
             ORDER BY uc.enrolled_at DESC`,
            [userId]
          );
        },

        async getCourseEnrollment(userId, skillId) {
          const rows = await query('SELECT * FROM user_courses WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
          return rows[0] || null;
        },

        async updateCourseStatus(userId, skillId, status) {
          return insert(
            'UPDATE user_courses SET status = ?, last_activity_at = CURRENT_TIMESTAMP WHERE user_id = ? AND skill_id = ?',
            [status, userId, skillId]
          );
        },

        async enrollPlan(userId, skillId) {
          await insert('INSERT OR IGNORE INTO user_plan_progress (user_id, skill_id) VALUES (?, ?)', [userId, skillId]);
          const rows = await query('SELECT * FROM user_plan_progress WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
          return rows[0] || null;
        },

        async getPlanProgress(userId, skillId) {
          const rows = await query('SELECT * FROM user_plan_progress WHERE user_id = ? AND skill_id = ?', [userId, skillId]);
          return rows[0] || null;
        },

        async getLearningPlan(skillId) {
          return query(
            `SELECT lp.day_number, lp.content_id, lp.content_type, lp.reason,
                    c.title, c.url, c.thumbnail, c.duration, c.author, c.source
             FROM learning_plans lp
             LEFT JOIN content c ON c.id = lp.content_id
             WHERE lp.skill_id = ?
             ORDER BY lp.day_number ASC`,
            [skillId]
          );
        },

        async saveLearningPlan(skillId, days) {
          await insert('DELETE FROM learning_plans WHERE skill_id = ?', [skillId]);
          for (const entry of days) {
            await insert(
              'INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason) VALUES (?, ?, ?, ?, ?)',
              [skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null]
            );
          }
        },

        async addSubscriber(email, skillCategories = null) {
          const categoriesJson = skillCategories ? JSON.stringify(skillCategories) : null;
          return insert('INSERT OR IGNORE INTO subscribers (email, skill_categories) VALUES (?, ?)', [email, categoriesJson]);
        },

        async getSubscriberCount() {
          const rows = await query('SELECT COUNT(*) as count FROM subscribers');
          return rows[0]?.count || 0;
        },

        async rateContent(userId, contentId, rating) {
          await insert(
            "DELETE FROM user_interactions WHERE user_id = ? AND content_id = ? AND interaction_type IN ('thumbs_up', 'thumbs_down')",
            [userId, contentId]
          );
          if (rating !== null) {
            await insert(
              'INSERT INTO user_interactions (user_id, content_id, interaction_type) VALUES (?, ?, ?)',
              [userId, contentId, rating]
            );
          }
        },

        async getUserRatings(userId, contentIds) {
          if (!contentIds.length) return {};
          const placeholders = contentIds.map(() => '?').join(', ');
          const rows = await query(
            `SELECT content_id, interaction_type FROM user_interactions
             WHERE user_id = ? AND content_id IN (${placeholders})
               AND interaction_type IN ('thumbs_up', 'thumbs_down')`,
            [userId, ...contentIds]
          );
          const result = {};
          for (const row of rows) result[row.content_id] = row.interaction_type;
          return result;
        },

        async getRatingCounts(contentIds) {
          if (!contentIds.length) return {};
          const placeholders = contentIds.map(() => '?').join(', ');
          const rows = await query(
            `SELECT content_id, interaction_type, COUNT(*) as count
             FROM user_interactions
             WHERE content_id IN (${placeholders})
               AND interaction_type IN ('thumbs_up', 'thumbs_down')
             GROUP BY content_id, interaction_type`,
            contentIds
          );
          const result = {};
          for (const row of rows) {
            if (!result[row.content_id]) result[row.content_id] = { thumbs_up: 0, thumbs_down: 0 };
            result[row.content_id][row.interaction_type] = row.count;
          }
          return result;
        },

        async logScrape({ skill_id, source, status, items_fetched = 0, error_message = null, quota_used = 0, duration_ms = null }) {
          return insert(
            'INSERT INTO scrape_log (skill_id, source, status, items_fetched, error_message, quota_used, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [skill_id, source, status, items_fetched, error_message, quota_used, duration_ms]
          );
        },

        async getMetrics() {
          return { scrapeStats: [], skillHealth: [], youtubeQuota: { used: 0, limit: 10000, percentUsed: 0 }, recentErrors: [], contentCounts: [] };
        },

        close() {
          return new Promise((res) => raw.close(() => res()));
        },
      };

      // Initialize tables and indexes
      raw.serialize(() => {
        TABLE_SQL.forEach((sql) => raw.run(sql));
        INDEX_SQL.forEach((sql) => raw.run(sql));
        raw.run('SELECT 1', [], () => resolve(db));
      });
    });
  });
}

async function clearTables(db) {
  const tables = [
    'skills', 'content', 'users', 'user_streaks', 'user_interactions',
    'user_courses', 'push_subscriptions', 'subscribers', 'learning_plans',
    'user_plan_progress', 'scrape_log', 'user_onboarding',
  ];
  for (const t of tables) {
    await db.insert(`DELETE FROM ${t}`);
  }
}

module.exports = { createTestDb, clearTables };
