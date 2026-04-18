const sqlite3 = require('sqlite3').verbose();
const { getApplicableSources } = require('../../constants/sourceApplicability');
const { assertValidReviewBody } = require('../../utils/reviewBodySchema');

function getPacificDayWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const utcStart = new Date(Date.UTC(year, month - 1, day, 7, 0, 0));
  const utcEnd = new Date(Date.UTC(year, month - 1, day + 1, 6, 59, 59));

  const toSqliteUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  return {
    start: toSqliteUtc(utcStart),
    end: toSqliteUtc(utcEnd),
  };
}

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
    plan_tier TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'free',
    subscription_id TEXT,
    subscription_end_date TEXT,
    stripe_customer_id TEXT,
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
    review_status TEXT DEFAULT 'ready',
    review_title TEXT,
    review_body TEXT,
    timestamp_start_seconds INTEGER,
    timestamp_end_seconds INTEGER,
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
    attribution_source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_learning_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    content_id TEXT,
    content_type TEXT,
    reason TEXT,
    review_status TEXT DEFAULT 'ready',
    review_title TEXT,
    review_body TEXT,
    timestamp_start_seconds INTEGER,
    timestamp_end_seconds INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    UNIQUE(user_id, skill_id, day_number)
  )`,
  `CREATE TABLE IF NOT EXISTS plan_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id TEXT NOT NULL,
    user_id INTEGER,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    day_number INTEGER,
    payload TEXT,
    result TEXT,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    plan_created_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS plan_review_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id TEXT NOT NULL,
    user_id INTEGER,
    day_number INTEGER NOT NULL,
    review_type TEXT NOT NULL DEFAULT 'weekly_checkin',
    title TEXT,
    body TEXT,
    plan_created_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS review_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    result_summary TEXT,
    reflection TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    UNIQUE(user_id, skill_id, day_number)
  )`,
  `CREATE TABLE IF NOT EXISTS premium_plan_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    skill_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    content_id TEXT,
    content_type TEXT,
    reason TEXT,
    review_status TEXT,
    review_title TEXT,
    review_body TEXT,
    status TEXT DEFAULT 'pending_merge',
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (skill_id) REFERENCES skills(id),
    FOREIGN KEY (content_id) REFERENCES content(id),
    UNIQUE(user_id, skill_id, day_number)
  )`,
  `CREATE TABLE IF NOT EXISTS review_submission_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    check_id TEXT NOT NULL,
    question TEXT NOT NULL,
    check_type TEXT NOT NULL DEFAULT 'short_answer',
    answer TEXT,
    correct INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES review_submissions(id)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data TEXT,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
];

const INDEX_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_content_skill_id ON content(skill_id)',
  'CREATE INDEX IF NOT EXISTS idx_interactions_content_id ON user_interactions(content_id)',
  'CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON user_interactions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_plans_user_skill ON user_learning_plans(user_id, skill_id)',
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

        async updateUserSubscription(userId, { subscription_status, subscription_id, subscription_end_date }) {
          return insert(
            `UPDATE users SET subscription_status = ?, subscription_id = ?, subscription_end_date = ? WHERE id = ?`,
            [subscription_status, subscription_id, subscription_end_date, userId]
          );
        },

        async setStripeCustomerId(userId, stripeCustomerId) {
          return insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, userId]);
        },

        async getUserByStripeCustomerId(stripeCustomerId) {
          const rows = await query('SELECT * FROM users WHERE stripe_customer_id = ?', [stripeCustomerId]);
          return rows[0] || null;
        },

        async getActiveEnrollmentCount(userId) {
          const rows = await query(
            `SELECT COUNT(*) as count FROM user_courses WHERE user_id = ? AND status = 'active'`,
            [userId]
          );
          return rows[0]?.count || 0;
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
                    lp.review_status, lp.review_title, lp.review_body,
                    lp.timestamp_start_seconds, lp.timestamp_end_seconds,
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
              'INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
               entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
               entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
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

        async getUserLearningPlan(userId, skillId) {
          return query(
            `SELECT ulp.day_number, ulp.content_id, ulp.content_type, ulp.reason, ulp.created_at,
                    ulp.review_status, ulp.review_title, ulp.review_body,
                    ulp.timestamp_start_seconds, ulp.timestamp_end_seconds,
                    c.title, c.url, c.thumbnail, c.duration, c.author, c.source
             FROM user_learning_plans ulp
             LEFT JOIN content c ON c.id = ulp.content_id
             WHERE ulp.user_id = ? AND ulp.skill_id = ?
             ORDER BY ulp.day_number ASC`,
            [userId, skillId]
          );
        },

        async saveUserLearningPlan(userId, skillId, days) {
          await insert(
            'DELETE FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
            [userId, skillId]
          );
          for (const entry of days) {
            await insert(
              `INSERT INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
               entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
               entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
            );
          }
        },

        async deleteUserLearningPlan(userId, skillId) {
          return insert(
            'DELETE FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
            [userId, skillId]
          );
        },

        async getUserPlanMaxCreatedAt(userId, skillId) {
          const rows = await query(
            'SELECT MAX(created_at) as max_created_at FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
            [userId, skillId]
          );
          return rows[0]?.max_created_at || null;
        },

        async getSharedPlanCreatedAt(skillId) {
          const rows = await query(
            'SELECT MAX(created_at) as created_at FROM learning_plans WHERE skill_id = ?',
            [skillId]
          );
          return rows[0]?.created_at || null;
        },

        async refreshUserPlanDays(userId, skillId, days) {
          for (const entry of days) {
            await insert(
              `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [userId, skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
               entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
               entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
            );
          }
        },

        // --- Plan job queue methods ---

        async createPlanJob({ skill_id, user_id = null, job_type, day_number, payload = null, plan_created_at = null }) {
          return insert(
            `INSERT INTO plan_jobs (skill_id, user_id, job_type, day_number, payload, plan_created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [skill_id, user_id, job_type, day_number, payload ? JSON.stringify(payload) : null, plan_created_at]
          );
        },

        async getPendingJobs(limit = 50) {
          return query(
            `SELECT * FROM plan_jobs
             WHERE status = 'pending' AND attempts < max_attempts
             ORDER BY created_at ASC
             LIMIT ?`,
            [limit]
          );
        },

        async getPendingPremiumPlanJobs(limit = 50) {
          return query(
            `SELECT * FROM plan_jobs
             WHERE status = 'pending'
               AND attempts < max_attempts
               AND job_type = 'premium_plan_generation'
             ORDER BY created_at ASC
             LIMIT ?`,
            [limit]
          );
        },

        async claimJob(jobId) {
          const result = await insert(
            `UPDATE plan_jobs
             SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`,
            [jobId]
          );
          if (result.changes === 0) return null;
          const rows = await query('SELECT * FROM plan_jobs WHERE id = ?', [jobId]);
          return rows[0] || null;
        },

        async completeJob(jobId, result = null) {
          return insert(
            `UPDATE plan_jobs
             SET status = 'completed', result = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [result ? JSON.stringify(result) : null, jobId]
          );
        },

        async failJob(jobId, errorMessage) {
          const rows = await query('SELECT attempts, max_attempts FROM plan_jobs WHERE id = ?', [jobId]);
          const job = rows[0];
          const newStatus = job && job.attempts >= job.max_attempts ? 'failed' : 'pending';
          return insert(
            `UPDATE plan_jobs
             SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newStatus, errorMessage, jobId]
          );
        },

        async cancelJobsForSkill(skillId, jobType = null) {
          let sql = `UPDATE plan_jobs SET status = 'failed', error_message = 'superseded', updated_at = CURRENT_TIMESTAMP
                     WHERE skill_id = ? AND status IN ('pending', 'processing')`;
          const params = [skillId];
          if (jobType) {
            sql += ' AND job_type = ?';
            params.push(jobType);
          }
          return insert(sql, params);
        },

        async hasIncompleteJobs(skillId, jobType = null) {
          let sql = `SELECT COUNT(*) as count FROM plan_jobs
                     WHERE skill_id = ? AND status IN ('pending', 'processing')`;
          const params = [skillId];
          if (jobType) {
            sql += ' AND job_type = ?';
            params.push(jobType);
          }
          const rows = await query(sql, params);
          return (rows[0]?.count || 0) > 0;
        },

        async getPlanJobs(skillId, jobType = null) {
          let sql = `SELECT * FROM plan_jobs WHERE skill_id = ?`;
          const params = [skillId];
          if (jobType) {
            sql += ' AND job_type = ?';
            params.push(jobType);
          }
          sql += ' ORDER BY day_number ASC, id ASC';
          return query(sql, params);
        },

        async saveReviewContent({ skill_id, user_id = null, day_number, review_type, title, body, plan_created_at }) {
          const validated = assertValidReviewBody(body);
          await insert(
            `DELETE FROM plan_review_content WHERE skill_id = ? AND day_number = ? AND user_id IS ?`,
            [skill_id, day_number, user_id]
          );
          return insert(
            `INSERT INTO plan_review_content (skill_id, user_id, day_number, review_type, title, body, plan_created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [skill_id, user_id, day_number, review_type, title, JSON.stringify(validated), plan_created_at]
          );
        },

        async saveSharedReviewContent({ skill_id, day_number, review_type, title, body, plan_created_at }) {
          const validated = assertValidReviewBody(body);
          const serialized = JSON.stringify(validated);
          await insert(
            `UPDATE learning_plans
             SET review_status = 'ready',
                 review_title = ?,
                 review_body = ?,
                 created_at = CURRENT_TIMESTAMP
             WHERE skill_id = ? AND day_number = ? AND content_type = 'review'`,
            [title, serialized, skill_id, day_number]
          );
          return insert(
            `INSERT INTO plan_review_content (skill_id, user_id, day_number, review_type, title, body, plan_created_at)
             VALUES (?, NULL, ?, ?, ?, ?, ?)`,
            [skill_id, day_number, review_type, title, serialized, plan_created_at]
          );
        },

        async getReviewContent(skillId, dayNumber, userId = null) {
          const rows = await query(
            `SELECT * FROM plan_review_content
             WHERE skill_id = ? AND day_number = ? AND user_id IS ?
             ORDER BY created_at DESC LIMIT 1`,
            [skillId, dayNumber, userId]
          );
          return rows[0] || null;
        },

        async getReviewContentForPlan(skillId, userId = null) {
          return query(
            `SELECT * FROM plan_review_content
             WHERE skill_id = ? AND user_id IS ?
             ORDER BY day_number ASC`,
            [skillId, userId]
          );
        },

        async deleteReviewContentForSkill(skillId) {
          return insert('DELETE FROM plan_review_content WHERE skill_id = ?', [skillId]);
        },

        async createReviewSubmission({ user_id, skill_id, day_number, status, result_summary = null, reflection = null }) {
          const result = await insert(
            `INSERT INTO review_submissions (user_id, skill_id, day_number, status, result_summary, reflection)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, skill_id, day_number) DO UPDATE SET
               status = excluded.status,
               result_summary = excluded.result_summary,
               reflection = excluded.reflection,
               updated_at = CURRENT_TIMESTAMP`,
            [user_id, skill_id, day_number, status, result_summary, reflection]
          );
          const rows = await query(
            'SELECT * FROM review_submissions WHERE user_id = ? AND skill_id = ? AND day_number = ?',
            [user_id, skill_id, day_number]
          );
          return rows[0] || null;
        },

        async saveReviewSubmissionAnswers(submissionId, answers) {
          await insert('DELETE FROM review_submission_answers WHERE submission_id = ?', [submissionId]);
          for (const ans of answers) {
            await insert(
              `INSERT INTO review_submission_answers (submission_id, check_id, question, check_type, answer, correct)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [submissionId, ans.check_id, ans.question, ans.check_type || 'short_answer', ans.answer, ans.correct ?? null]
            );
          }
        },

        async getReviewSubmission(userId, skillId, dayNumber) {
          const rows = await query(
            'SELECT * FROM review_submissions WHERE user_id = ? AND skill_id = ? AND day_number = ?',
            [userId, skillId, dayNumber]
          );
          return rows[0] || null;
        },

        async getReviewSubmissionAnswers(submissionId) {
          return query(
            'SELECT * FROM review_submission_answers WHERE submission_id = ? ORDER BY id ASC',
            [submissionId]
          );
        },

        async getUserPlanTier(userId) {
          const rows = await query('SELECT plan_tier FROM users WHERE id = ?', [userId]);
          return rows[0]?.plan_tier || 'free';
        },

        async getMetrics() {
          const { start: pacificDayStart, end: pacificDayEnd } = getPacificDayWindow();

          const [scrapeStats, rawSkillHealth, youtubeQuotaRows, recentErrors, contentCounts, latestSourceRows] = await Promise.all([
            query(`
              SELECT source,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
                SUM(CASE WHEN status = 'quota_exceeded' THEN 1 ELSE 0 END) as quota_exceeded
              FROM scrape_log
              WHERE scraped_at >= datetime('now', '-7 days')
              GROUP BY source
            `),
            query(`
              SELECT s.id as skill_id, s.name, s.category, s.status, s.last_scraped_at,
                COUNT(c.id) as content_count
              FROM skills s
              LEFT JOIN content c ON c.skill_id = s.id
              GROUP BY s.id
              ORDER BY s.name
            `),
            query(`
              SELECT COALESCE(SUM(quota_used), 0) as quota_used_today
              FROM scrape_log
              WHERE source = 'youtube'
                AND scraped_at >= ?
                AND scraped_at <= ?
            `, [pacificDayStart, pacificDayEnd]),
            query(`
              SELECT sl.skill_id, sl.source, sl.error_message, sl.scraped_at
              FROM scrape_log sl
              WHERE sl.status IN ('error', 'quota_exceeded')
                AND (
                  sl.status = 'quota_exceeded'
                  OR NOT EXISTS (
                    SELECT 1 FROM content c WHERE c.skill_id = sl.skill_id
                  )
                  OR EXISTS (
                    SELECT 1 FROM skills s WHERE s.id = sl.skill_id AND s.status = 'error'
                  )
                )
              ORDER BY sl.scraped_at DESC
              LIMIT 20
            `),
            query(`
              SELECT skill_id, type, COUNT(*) as count
              FROM content
              GROUP BY skill_id, type
              ORDER BY skill_id, type
            `),
            query(`
              SELECT sl.skill_id, sl.source, sl.status
              FROM scrape_log sl
              INNER JOIN (
                SELECT skill_id, source, MAX(id) as max_id
                FROM scrape_log
                GROUP BY skill_id, source
              ) latest ON latest.max_id = sl.id
            `)
          ]);

          const latestBySkill = new Map();
          for (const row of latestSourceRows) {
            if (!latestBySkill.has(row.skill_id)) latestBySkill.set(row.skill_id, new Map());
            latestBySkill.get(row.skill_id).set(row.source, row.status);
          }

          const skillHealth = rawSkillHealth.map((skill) => {
            const applicableSources = getApplicableSources(skill.category);
            const latestStatuses = latestBySkill.get(skill.skill_id) || new Map();
            const relevantStatuses = [...applicableSources]
              .map((source) => latestStatuses.get(source))
              .filter(Boolean);

            let derivedStatus;
            if (skill.status === 'error') {
              derivedStatus = 'error';
            } else if (skill.content_count === 0 && relevantStatuses.some((s) => s === 'error' || s === 'quota_exceeded')) {
              derivedStatus = 'error';
            } else if (skill.content_count > 0 && relevantStatuses.some((s) => s === 'error' || s === 'quota_exceeded')) {
              derivedStatus = 'partial';
            } else if (skill.content_count > 0 && relevantStatuses.every((s) => s === 'success' || s === 'skipped') && relevantStatuses.length > 0) {
              derivedStatus = 'success';
            } else if (relevantStatuses.some((s) => s === 'success' || s === 'skipped')) {
              derivedStatus = skill.content_count > 0 ? 'success' : (skill.status || 'pending');
            } else {
              derivedStatus = skill.status || 'pending';
            }

            return {
              skill_id: skill.skill_id,
              name: skill.name,
              last_scraped_at: skill.last_scraped_at,
              content_count: skill.content_count,
              last_scrape_status: derivedStatus,
            };
          });

          const quotaUsedToday = youtubeQuotaRows[0]?.quota_used_today || 0;
          return {
            scrapeStats,
            skillHealth,
            youtubeQuota: { used: quotaUsedToday, limit: 10000, percentUsed: Math.round((quotaUsedToday / 10000) * 100) },
            recentErrors,
            contentCounts
          };
        },

        async createNotification({ user_id, type, title, body = null, data = null }) {
          const dataStr = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
          const result = await insert(
            'INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)',
            [user_id, type, title, body, dataStr]
          );
          return { id: result.id, user_id, type, title, body, data: dataStr, read_at: null };
        },

        async getNotifications(userId, { limit = 20, offset = 0 } = {}) {
          return query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [userId, limit, offset]
          );
        },

        async getUnreadNotificationCount(userId) {
          const rows = await query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL',
            [userId]
          );
          return rows[0]?.count || 0;
        },

        async markNotificationRead(notificationId, userId) {
          await insert(
            'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [notificationId, userId]
          );
        },

        async markAllNotificationsRead(userId) {
          await insert(
            'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
            [userId]
          );
        },

        async savePremiumPlanDays(userId, skillId, days) {
          for (const entry of days) {
            await insert(
              `INSERT OR REPLACE INTO premium_plan_days (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, status, generated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_merge', CURRENT_TIMESTAMP)`,
              [
                userId,
                skillId,
                entry.day_number,
                entry.content_id || null,
                entry.content_type || null,
                entry.reason || null,
                entry.review_status || null,
                entry.review_title || null,
                entry.review_body ? JSON.stringify(entry.review_body) : null,
              ]
            );
          }
        },

        async getPremiumPlanPending(userId, skillId) {
          return query(
            `SELECT * FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge' ORDER BY day_number ASC`,
            [userId, skillId]
          );
        },

        async mergePremiumPlan(userId, skillId) {
          const pending = await db.getPremiumPlanPending(userId, skillId);
          const progress = await db.getPlanProgress(userId, skillId);
          const completedDays = new Set(JSON.parse(progress?.completed_days || '[]'));

          for (const row of pending) {
            if (completedDays.has(row.day_number)) continue;
            await insert(
              `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [userId, skillId, row.day_number, row.content_id, row.content_type, row.reason, row.review_status, row.review_title, row.review_body]
            );
          }
          await insert(
            `UPDATE premium_plan_days SET status = 'merged' WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
            [userId, skillId]
          );
        },

        async deletePendingPremiumPlan(userId, skillId) {
          return insert(
            `DELETE FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
            [userId, skillId]
          );
        },

        async getUserSkillsWithPremiumHistory(userId) {
          const rows = await query(
            `SELECT DISTINCT skill_id FROM premium_plan_days WHERE user_id = ? AND status = 'merged'`,
            [userId]
          );
          return rows.map(r => r.skill_id);
        },

        async hasPendingPremiumPlan(userId, skillId) {
          const rows = await query(
            `SELECT COUNT(*) as count FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
            [userId, skillId]
          );
          return (rows[0]?.count || 0) > 0;
        },

        async completePlanDay(userId, skillId, day) {
          const row = await db.getPlanProgress(userId, skillId);
          if (!row) return null;
          const completed = JSON.parse(row.completed_days || '[]');
          if (!completed.includes(day)) completed.push(day);
          await insert(
            `UPDATE user_plan_progress SET completed_days = ?, last_activity_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND skill_id = ?`,
            [JSON.stringify(completed), userId, skillId]
          );
          return db.getPlanProgress(userId, skillId);
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
    'user_plan_progress', 'scrape_log', 'user_onboarding', 'user_learning_plans',
    'plan_jobs', 'plan_review_content',
    'review_submission_answers', 'review_submissions',
    'notifications', 'premium_plan_days',
  ];
  for (const t of tables) {
    await db.insert(`DELETE FROM ${t}`);
  }
}

module.exports = { createTestDb, clearTables };
