const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getApplicableSources } = require('../constants/sourceApplicability');
const { assertValidReviewBody } = require('../utils/reviewBodySchema');

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

      `CREATE TABLE IF NOT EXISTS skill_aliases (
        source_id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_id) REFERENCES skills (id)
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
        free_skill_creations_count INTEGER DEFAULT 0,
        premium_trial_started_at TEXT,
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
        review_status TEXT DEFAULT 'ready',
        review_title TEXT,
        review_body TEXT,
        timestamp_start_seconds INTEGER,
        timestamp_end_seconds INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (content_id) REFERENCES content(id)
      )`,

      // Per-user learning plan progress
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

      // User streaks
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

      // Push notification subscriptions
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

      // User onboarding answers
      `CREATE TABLE IF NOT EXISTS user_onboarding (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        user_type TEXT,
        goal TEXT,
        daily_time TEXT,
        attribution_source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // Per-user learning plans (personal copy of shared plan)
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

      // Async job queue for plan-related background work
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

      // Generated weekly review/check-in content for plan days
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

      // User review submissions (one per user + skill + day)
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

      // In-app notifications
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

      // Premium personalized plan days (pending merge into user_learning_plans)
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

      // Individual answers within a review submission
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
        "ALTER TABLE skills ADD COLUMN status TEXT DEFAULT 'pending'",
        'ALTER TABLE user_interactions ADD COLUMN user_id INTEGER REFERENCES users(id)',
        'ALTER TABLE learning_plans ADD COLUMN timestamp_start_seconds INTEGER',
        'ALTER TABLE learning_plans ADD COLUMN timestamp_end_seconds INTEGER',
        "ALTER TABLE learning_plans ADD COLUMN review_status TEXT DEFAULT 'ready'",
        'ALTER TABLE learning_plans ADD COLUMN review_title TEXT',
        'ALTER TABLE learning_plans ADD COLUMN review_body TEXT',
        'ALTER TABLE user_learning_plans ADD COLUMN timestamp_start_seconds INTEGER',
        'ALTER TABLE user_learning_plans ADD COLUMN timestamp_end_seconds INTEGER',
        "ALTER TABLE user_learning_plans ADD COLUMN review_status TEXT DEFAULT 'ready'",
        'ALTER TABLE user_learning_plans ADD COLUMN review_title TEXT',
        'ALTER TABLE user_learning_plans ADD COLUMN review_body TEXT',
        "ALTER TABLE users ADD COLUMN plan_tier TEXT DEFAULT 'free'",
        'ALTER TABLE users ADD COLUMN stripe_customer_id TEXT',
        "ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'free'",
        'ALTER TABLE users ADD COLUMN subscription_id TEXT',
        'ALTER TABLE users ADD COLUMN subscription_end_date TEXT',
        'ALTER TABLE users ADD COLUMN free_skill_creations_count INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN premium_trial_started_at TEXT',
        'ALTER TABLE user_onboarding ADD COLUMN attribution_source TEXT',
        'ALTER TABLE user_onboarding ADD COLUMN created_at DATETIME',
        "ALTER TABLE premium_plan_days ADD COLUMN review_status TEXT DEFAULT 'ready'",
        'ALTER TABLE premium_plan_days ADD COLUMN review_title TEXT',
        'ALTER TABLE premium_plan_days ADD COLUMN review_body TEXT'
      ];
      migrations.forEach(sql => {
        this.db.run(sql, (err) => {
          // Ignore "duplicate column" errors — expected when column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error:', err.message);
          }
        });
      });


      // Indexes for frequently queried columns
      const indexes = [
        // Content lookups by skill (every skill page load)
        'CREATE INDEX IF NOT EXISTS idx_content_skill_id ON content(skill_id)',
        // User interactions by content (rating aggregation on every skill page)
        'CREATE INDEX IF NOT EXISTS idx_interactions_content_id ON user_interactions(content_id)',
        // User interactions by user (user-specific ratings)
        'CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON user_interactions(user_id)',
        // Scrape log by skill + date (admin metrics, nightly scrape checks)
        'CREATE INDEX IF NOT EXISTS idx_scrape_log_skill_id ON scrape_log(skill_id)',
        'CREATE INDEX IF NOT EXISTS idx_scrape_log_scraped_at ON scrape_log(scraped_at)',
        'CREATE INDEX IF NOT EXISTS idx_scrape_log_source ON scrape_log(source)',
        // Course lookups by user (my courses page)
        'CREATE INDEX IF NOT EXISTS idx_courses_user_id ON user_courses(user_id)',
        // Learning plans by skill (plan page load)
        'CREATE INDEX IF NOT EXISTS idx_plans_skill_id ON learning_plans(skill_id)',
        // Plan progress by user (progress checks)
        'CREATE INDEX IF NOT EXISTS idx_plan_progress_user_id ON user_plan_progress(user_id)',
        // Push subscriptions by user (sending notifications)
        'CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id)',
        // Skills by status (nightly scrape filtering)
        'CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status)',
        'CREATE INDEX IF NOT EXISTS idx_skills_last_scraped ON skills(last_scraped_at)',
        // Skill alias reverse lookups / integrity checks
        'CREATE INDEX IF NOT EXISTS idx_skill_aliases_target_id ON skill_aliases(target_id)',
        // User learning plans by user+skill (plan fetch)
        'CREATE INDEX IF NOT EXISTS idx_user_plans_user_skill ON user_learning_plans(user_id, skill_id)',
        // Plan jobs by skill+status (readiness checks, job processing)
        'CREATE INDEX IF NOT EXISTS idx_plan_jobs_skill_status ON plan_jobs(skill_id, status)',
        'CREATE INDEX IF NOT EXISTS idx_plan_jobs_status ON plan_jobs(status)',
        // Review content by skill+day (serving review content)
        'CREATE INDEX IF NOT EXISTS idx_review_content_skill_day ON plan_review_content(skill_id, day_number)',
        // Review submissions by user+skill (fetching user submissions)
        'CREATE INDEX IF NOT EXISTS idx_review_submissions_user_skill ON review_submissions(user_id, skill_id)',
        // Review submission answers by submission (fetching answers)
        'CREATE INDEX IF NOT EXISTS idx_review_answers_submission ON review_submission_answers(submission_id)',
        // Notifications by user (listing user notifications)
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
        // Premium plan days by user+skill (premium plan lookups)
        'CREATE INDEX IF NOT EXISTS idx_premium_plan_days_user_skill ON premium_plan_days(user_id, skill_id)',
      ];
      indexes.forEach(sql => {
        this.db.run(sql, (err) => {
          if (err) console.error('Index creation error:', err.message);
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

  // Get content counts for a list of skill IDs in one query
  async getContentCounts(skillIds) {
    if (!skillIds || skillIds.length === 0) return {};
    const placeholders = skillIds.map(() => '?').join(',');
    const rows = await this.query(
      `SELECT skill_id, COUNT(*) as count FROM content WHERE skill_id IN (${placeholders}) GROUP BY skill_id`,
      skillIds
    );
    const counts = {};
    rows.forEach(row => { counts[row.skill_id] = row.count; });
    return counts;
  }

  // Get a single skill by ID
  async getSkillById(id) {
    const rows = await this.query('SELECT * FROM skills WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async getSkillAlias(sourceId) {
    const rows = await this.query('SELECT * FROM skill_aliases WHERE source_id = ?', [sourceId]);
    return rows[0] || null;
  }

  async saveSkillAlias(sourceId, targetId) {
    return this.insert(
      `INSERT INTO skill_aliases (source_id, target_id)
       VALUES (?, ?)
       ON CONFLICT(source_id) DO UPDATE SET target_id = excluded.target_id`,
      [sourceId, targetId]
    );
  }

  // Update skill status
  async updateSkillStatus(id, status) {
    return this.insert('UPDATE skills SET status = ? WHERE id = ?', [status, id]);
  }

  // Get content for a skill, ordered by rating score + views
  // Filters out low-quality video content (shorts, memes, very short duration)
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
    let params = [skillId];

    if (type) {
      sql += ' AND c.type = ?';
      params.push(type);
    }

    // Filter out low-quality video content:
    // 1. Videos under 3 minutes (catches shorts, memes, teasers)
    //    Duration format is either "M:SS" or "H:MM:SS"
    //    Keep videos with "H:MM:SS" format (always 1hr+), filter short "M:SS" ones
    // 2. Title-based heuristics for non-educational content
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
    const { start: pacificDayStart, end: pacificDayEnd } = getPacificDayWindow();

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
      // skillHealth is derived below in JS using latest per-source status and
      // shared source applicability rules, so old stale failures do not poison
      // otherwise healthy skills forever.
      this.query(`
        SELECT s.id as skill_id, s.name, s.category, s.status, s.last_scraped_at,
          COUNT(c.id) as content_count
        FROM skills s
        LEFT JOIN content c ON c.skill_id = s.id
        GROUP BY s.id
        ORDER BY s.name
      `),
      // YouTube quota used today (Pacific time)
      this.query(`
        SELECT COALESCE(SUM(quota_used), 0) as quota_used_today
        FROM scrape_log
        WHERE source = 'youtube'
          AND scraped_at >= ?
          AND scraped_at <= ?
      `, [pacificDayStart, pacificDayEnd]),
      // recentErrors: last 20 error rows, excluding per-source failures
      // where the skill has content from other sources (e.g. freeCodeCamp 404s
      // on non-tech skills that have YouTube/Dev.to content)
      this.query(`
        SELECT sl.skill_id, sl.source, sl.error_message, sl.scraped_at
        FROM scrape_log sl
        WHERE sl.status IN ('error', 'quota_exceeded')
          AND (
            -- Always show quota_exceeded errors
            sl.status = 'quota_exceeded'
            -- Show source errors only if the skill has no content at all,
            -- or the skill's overall status is 'error'
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

    const latestSourceRows = await this.query(`
      SELECT sl.skill_id, sl.source, sl.status
      FROM scrape_log sl
      INNER JOIN (
        SELECT skill_id, source, MAX(id) as max_id
        FROM scrape_log
        GROUP BY skill_id, source
      ) latest ON latest.max_id = sl.id
    `);

    const latestBySkill = new Map();
    for (const row of latestSourceRows) {
      if (!latestBySkill.has(row.skill_id)) latestBySkill.set(row.skill_id, new Map());
      latestBySkill.get(row.skill_id).set(row.source, row.status);
    }

    const derivedSkillHealth = skillHealth.map((skill) => {
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

    return {
      scrapeStats,
      skillHealth: derivedSkillHealth,
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

  async setStripeCustomerId(userId, stripeCustomerId) {
    return this.insert('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, userId]);
  }

  async getUserByStripeCustomerId(stripeCustomerId) {
    const rows = await this.query('SELECT * FROM users WHERE stripe_customer_id = ?', [stripeCustomerId]);
    return rows[0] || null;
  }

  async updateUserSubscription(userId, { subscription_status, subscription_id, subscription_end_date }) {
    return this.insert(
      `UPDATE users
       SET subscription_status = ?, subscription_id = ?, subscription_end_date = ?
       WHERE id = ?`,
      [subscription_status, subscription_id, subscription_end_date, userId]
    );
  }

  async incrementFreeSkillCreations(userId) {
    await this.insert(
      `UPDATE users
       SET free_skill_creations_count = COALESCE(free_skill_creations_count, 0) + 1
       WHERE id = ?`,
      [userId]
    );
    return this.getUserById(userId);
  }

  async markPremiumTrialStarted(userId, startedAt) {
    await this.insert(
      `UPDATE users
       SET premium_trial_started_at = COALESCE(premium_trial_started_at, ?)
       WHERE id = ?`,
      [startedAt, userId]
    );
    return this.getUserById(userId);
  }

  // --- Course enrollment methods ---

  async getActiveEnrollmentCount(userId) {
    const rows = await this.query(
      `SELECT COUNT(*) as count FROM user_courses WHERE user_id = ? AND status = 'active'`,
      [userId]
    );
    return rows[0]?.count || 0;
  }

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

  // --- User plan progress methods ---

  async enrollPlan(userId, skillId) {
    await this.insert(
      `INSERT OR IGNORE INTO user_plan_progress (user_id, skill_id) VALUES (?, ?)`,
      [userId, skillId]
    );
    const rows = await this.query(
      'SELECT * FROM user_plan_progress WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    return rows[0] || null;
  }

  async getPlanProgress(userId, skillId) {
    const rows = await this.query(
      'SELECT * FROM user_plan_progress WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    return rows[0] || null;
  }

  async completePlanDay(userId, skillId, day) {
    const row = await this.getPlanProgress(userId, skillId);
    if (!row) return null;
    const completed = JSON.parse(row.completed_days || '[]');
    if (!completed.includes(day)) completed.push(day);
    await this.insert(
      `UPDATE user_plan_progress SET completed_days = ?, last_activity_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND skill_id = ?`,
      [JSON.stringify(completed), userId, skillId]
    );
    return this.getPlanProgress(userId, skillId);
  }

  // --- Learning plan methods ---

  async getAllLearningPlans() {
    return this.query(
      `SELECT lp.skill_id, lp.day_number, lp.content_type, lp.reason,
              c.title, c.url, c.source
       FROM learning_plans lp
       LEFT JOIN content c ON c.id = lp.content_id
       ORDER BY lp.skill_id, lp.day_number ASC`
    );
  }

  async getLearningPlan(skillId) {
    return this.query(
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
  }

  async saveLearningPlan(skillId, days) {
    await this.insert('DELETE FROM learning_plans WHERE skill_id = ?', [skillId]);
    for (const entry of days) {
      await this.insert(
        `INSERT INTO learning_plans (skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
         entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
         entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
      );
    }
  }

  // --- User learning plan methods ---

  async getUserLearningPlan(userId, skillId) {
    return this.query(
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
  }

  async saveUserLearningPlan(userId, skillId, days) {
    await this.insert(
      'DELETE FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    for (const entry of days) {
      await this.insert(
        `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
         entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
         entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
      );
    }
  }

  async deleteUserLearningPlan(userId, skillId) {
    return this.insert(
      'DELETE FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
  }

  async getUserPlanMaxCreatedAt(userId, skillId) {
    const rows = await this.query(
      'SELECT MAX(created_at) as max_created_at FROM user_learning_plans WHERE user_id = ? AND skill_id = ?',
      [userId, skillId]
    );
    return rows[0]?.max_created_at || null;
  }

  async getSharedPlanCreatedAt(skillId) {
    const rows = await this.query(
      `SELECT MAX(created_at) as created_at
       FROM learning_plans
       WHERE skill_id = ?`,
      [skillId]
    );
    return rows[0]?.created_at || null;
  }

  async saveSharedReviewContent({ skill_id, day_number, review_type, title, body, plan_created_at }) {
    const validated = assertValidReviewBody(body);
    return this.insert(
      `UPDATE learning_plans
       SET review_status = 'ready',
           review_title = ?,
           review_body = ?,
           created_at = CURRENT_TIMESTAMP
       WHERE skill_id = ? AND day_number = ? AND content_type = 'review'`,
      [title, JSON.stringify(validated), skill_id, day_number]
    );
  }

  async refreshUserPlanDays(userId, skillId, days) {
    for (const entry of days) {
      await this.insert(
        `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, timestamp_start_seconds, timestamp_end_seconds, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, skillId, entry.day_number, entry.content_id || null, entry.content_type || null, entry.reason || null,
         entry.review_status || 'ready', entry.review_title || null, entry.review_body ? JSON.stringify(entry.review_body) : null,
         entry.timestamp_start_seconds ?? null, entry.timestamp_end_seconds ?? null]
      );
    }
  }

  // --- Content rating methods ---

  // Upsert a rating (thumbs_up / thumbs_down) or remove it (rating = null)
  async rateContent(userId, contentId, rating) {
    // Delete any existing rating for this user+content first (handles uniqueness)
    await this.insert(
      `DELETE FROM user_interactions WHERE user_id = ? AND content_id = ? AND interaction_type IN ('thumbs_up', 'thumbs_down')`,
      [userId, contentId]
    );
    if (rating !== null) {
      await this.insert(
        `INSERT INTO user_interactions (user_id, content_id, interaction_type) VALUES (?, ?, ?)`,
        [userId, contentId, rating]
      );
    }
  }

  // Get the current user's ratings for a list of content IDs
  // Returns: { [contentId]: 'thumbs_up' | 'thumbs_down' }
  async getUserRatings(userId, contentIds) {
    if (!contentIds.length) return {};
    const placeholders = contentIds.map(() => '?').join(', ');
    const rows = await this.query(
      `SELECT content_id, interaction_type FROM user_interactions
       WHERE user_id = ? AND content_id IN (${placeholders})
         AND interaction_type IN ('thumbs_up', 'thumbs_down')`,
      [userId, ...contentIds]
    );
    const result = {};
    for (const row of rows) result[row.content_id] = row.interaction_type;
    return result;
  }

  // Get aggregate thumbs up/down counts for a list of content IDs
  // Returns: { [contentId]: { thumbs_up: N, thumbs_down: N } }
  async getRatingCounts(contentIds) {
    if (!contentIds.length) return {};
    const placeholders = contentIds.map(() => '?').join(', ');
    const rows = await this.query(
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
  }

  // --- Plan job queue methods ---

  async createPlanJob({ skill_id, user_id = null, job_type, day_number, payload = null, plan_created_at = null }) {
    return this.insert(
      `INSERT INTO plan_jobs (skill_id, user_id, job_type, day_number, payload, plan_created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [skill_id, user_id, job_type, day_number, payload ? JSON.stringify(payload) : null, plan_created_at]
    );
  }

  async getPendingJobs(limit = 50) {
    return this.query(
      `SELECT * FROM plan_jobs
       WHERE status = 'pending' AND attempts < max_attempts
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );
  }

  async getPendingPremiumPlanJobs(limit = 50) {
    return this.query(
      `SELECT * FROM plan_jobs
       WHERE status = 'pending'
         AND attempts < max_attempts
         AND job_type = 'premium_plan_generation'
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );
  }

  async claimJob(jobId) {
    const result = await this.insert(
      `UPDATE plan_jobs
       SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [jobId]
    );
    if (result.changes === 0) return null;
    const rows = await this.query('SELECT * FROM plan_jobs WHERE id = ?', [jobId]);
    return rows[0] || null;
  }

  async completeJob(jobId, result = null) {
    return this.insert(
      `UPDATE plan_jobs
       SET status = 'completed', result = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result ? JSON.stringify(result) : null, jobId]
    );
  }

  async failJob(jobId, errorMessage) {
    const rows = await this.query('SELECT attempts, max_attempts FROM plan_jobs WHERE id = ?', [jobId]);
    const job = rows[0];
    const newStatus = job && job.attempts >= job.max_attempts ? 'failed' : 'pending';
    return this.insert(
      `UPDATE plan_jobs
       SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, errorMessage, jobId]
    );
  }

  async cancelJobsForSkill(skillId, jobType = null) {
    let sql = `UPDATE plan_jobs SET status = 'failed', error_message = 'superseded', updated_at = CURRENT_TIMESTAMP
               WHERE skill_id = ? AND status IN ('pending', 'processing')`;
    const params = [skillId];
    if (jobType) {
      sql += ' AND job_type = ?';
      params.push(jobType);
    }
    return this.insert(sql, params);
  }

  async hasIncompleteJobs(skillId, jobType = null) {
    let sql = `SELECT COUNT(*) as count FROM plan_jobs
               WHERE skill_id = ? AND status IN ('pending', 'processing')`;
    const params = [skillId];
    if (jobType) {
      sql += ' AND job_type = ?';
      params.push(jobType);
    }
    const rows = await this.query(sql, params);
    return (rows[0]?.count || 0) > 0;
  }

  async getPlanJobs(skillId, jobType = null) {
    let sql = `SELECT * FROM plan_jobs WHERE skill_id = ?`;
    const params = [skillId];
    if (jobType) {
      sql += ' AND job_type = ?';
      params.push(jobType);
    }
    sql += ' ORDER BY day_number ASC, id ASC';
    return this.query(sql, params);
  }

  // --- Plan review content methods ---

  async saveReviewContent({ skill_id, user_id = null, day_number, review_type, title, body, plan_created_at }) {
    const validated = assertValidReviewBody(body);
    await this.insert(
      `DELETE FROM plan_review_content WHERE skill_id = ? AND day_number = ? AND user_id IS ?`,
      [skill_id, day_number, user_id]
    );
    return this.insert(
      `INSERT INTO plan_review_content (skill_id, user_id, day_number, review_type, title, body, plan_created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [skill_id, user_id, day_number, review_type, title, JSON.stringify(validated), plan_created_at]
    );
  }

  async getReviewContent(skillId, dayNumber, userId = null) {
    const rows = await this.query(
      `SELECT * FROM plan_review_content
       WHERE skill_id = ? AND day_number = ? AND user_id IS ?
       ORDER BY created_at DESC LIMIT 1`,
      [skillId, dayNumber, userId]
    );
    return rows[0] || null;
  }

  async getReviewContentForPlan(skillId, userId = null) {
    return this.query(
      `SELECT * FROM plan_review_content
       WHERE skill_id = ? AND user_id IS ?
       ORDER BY day_number ASC`,
      [skillId, userId]
    );
  }

  async deleteReviewContentForSkill(skillId) {
    return this.insert('DELETE FROM plan_review_content WHERE skill_id = ?', [skillId]);
  }

  // --- Review submission methods ---

  async createReviewSubmission({ user_id, skill_id, day_number, status, result_summary = null, reflection = null }) {
    const result = await this.insert(
      `INSERT INTO review_submissions (user_id, skill_id, day_number, status, result_summary, reflection)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, skill_id, day_number) DO UPDATE SET
         status = excluded.status,
         result_summary = excluded.result_summary,
         reflection = excluded.reflection,
         updated_at = CURRENT_TIMESTAMP`,
      [user_id, skill_id, day_number, status, result_summary, reflection]
    );
    const rows = await this.query(
      'SELECT * FROM review_submissions WHERE user_id = ? AND skill_id = ? AND day_number = ?',
      [user_id, skill_id, day_number]
    );
    return rows[0] || null;
  }

  async saveReviewSubmissionAnswers(submissionId, answers) {
    await this.insert('DELETE FROM review_submission_answers WHERE submission_id = ?', [submissionId]);
    for (const ans of answers) {
      await this.insert(
        `INSERT INTO review_submission_answers (submission_id, check_id, question, check_type, answer, correct)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [submissionId, ans.check_id, ans.question, ans.check_type || 'short_answer', ans.answer, ans.correct ?? null]
      );
    }
  }

  async getReviewSubmission(userId, skillId, dayNumber) {
    const rows = await this.query(
      'SELECT * FROM review_submissions WHERE user_id = ? AND skill_id = ? AND day_number = ?',
      [userId, skillId, dayNumber]
    );
    return rows[0] || null;
  }

  async getReviewSubmissionAnswers(submissionId) {
    return this.query(
      'SELECT * FROM review_submission_answers WHERE submission_id = ? ORDER BY id ASC',
      [submissionId]
    );
  }

  async getUserPlanTier(userId) {
    const rows = await this.query('SELECT plan_tier FROM users WHERE id = ?', [userId]);
    return rows[0]?.plan_tier || 'free';
  }

  // --- Notification methods ---

  async createNotification({ user_id, type, title, body = null, data = null }) {
    const dataStr = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const result = await this.insert(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
      [user_id, type, title, body, dataStr]
    );
    return { id: result.id, user_id, type, title, body, data: dataStr, read_at: null };
  }

  async getNotifications(userId, { limit = 20, offset = 0 } = {}) {
    return this.query(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  }

  async getUnreadNotificationCount(userId) {
    const rows = await this.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [userId]
    );
    return rows[0]?.count || 0;
  }

  async markNotificationRead(notificationId, userId) {
    await this.insert(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
  }

  async markAllNotificationsRead(userId) {
    await this.insert(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
      [userId]
    );
  }

  // --- Premium plan methods ---

  async savePremiumPlanDays(userId, skillId, days) {
    for (const entry of days) {
      await this.insert(
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
  }

  async getPremiumPlanPending(userId, skillId) {
    return this.query(
      `SELECT * FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge' ORDER BY day_number ASC`,
      [userId, skillId]
    );
  }

  async mergePremiumPlan(userId, skillId) {
    const pending = await this.getPremiumPlanPending(userId, skillId);
    const progress = await this.getPlanProgress(userId, skillId);
    const completedDays = new Set(JSON.parse(progress?.completed_days || '[]'));

    for (const row of pending) {
      if (completedDays.has(row.day_number)) continue;
      await this.insert(
        `INSERT OR REPLACE INTO user_learning_plans (user_id, skill_id, day_number, content_id, content_type, reason, review_status, review_title, review_body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, skillId, row.day_number, row.content_id, row.content_type, row.reason, row.review_status, row.review_title, row.review_body]
      );
    }
    await this.insert(
      `UPDATE premium_plan_days SET status = 'merged' WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
      [userId, skillId]
    );
  }

  async deletePendingPremiumPlan(userId, skillId) {
    return this.insert(
      `DELETE FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
      [userId, skillId]
    );
  }

  async getUserSkillsWithPremiumHistory(userId) {
    const rows = await this.query(
      `SELECT DISTINCT skill_id FROM premium_plan_days WHERE user_id = ? AND status = 'merged'`,
      [userId]
    );
    return rows.map(r => r.skill_id);
  }

  async hasPendingPremiumPlan(userId, skillId) {
    const rows = await this.query(
      `SELECT COUNT(*) as count FROM premium_plan_days WHERE user_id = ? AND skill_id = ? AND status = 'pending_merge'`,
      [userId, skillId]
    );
    return (rows[0]?.count || 0) > 0;
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
