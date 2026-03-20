const db = require('../models/database');

function todayStr() {
  // Use Pacific time for streak date boundaries so users on the US West Coast
  // (our primary audience) don't have streaks break/freeze due to UTC midnight
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00:00Z');
  const b = new Date(dateStrB + 'T00:00:00Z');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Get Monday of the week containing `dateStr`
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // shift so Monday=0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const streakService = {
  // Ensure a user_streaks row exists, return it
  async ensureRow(userId) {
    const rows = await db.query('SELECT * FROM user_streaks WHERE user_id = ?', [userId]);
    if (rows[0]) return rows[0];
    await db.insert(
      `INSERT OR IGNORE INTO user_streaks (user_id, updated_at) VALUES (?, ?)`,
      [userId, new Date().toISOString()]
    );
    const created = await db.query('SELECT * FROM user_streaks WHERE user_id = ?', [userId]);
    return created[0];
  },

  async getStreak(userId) {
    let streak = await this.ensureRow(userId);
    const today = todayStr();

    // --- Check freeze recharge ---
    if (streak.freeze_available === 0 && streak.freeze_last_used_date) {
      const daysSinceFreeze = daysBetween(streak.freeze_last_used_date, today);
      if (daysSinceFreeze >= 7) {
        await db.insert(
          `UPDATE user_streaks SET freeze_available = 1, freeze_last_recharged_date = ?, updated_at = ? WHERE user_id = ?`,
          [today, new Date().toISOString(), userId]
        );
        streak.freeze_available = 1;
        streak.freeze_last_recharged_date = today;
      }
    }

    // --- Check if streak should be broken or frozen ---
    if (streak.last_activity_date && streak.last_activity_date !== today) {
      const gap = daysBetween(streak.last_activity_date, today);

      if (gap === 1) {
        // Yesterday — streak is active, no action needed
      } else if (gap >= 2) {
        // Missed at least one day
        if (streak.freeze_available > 0 && gap === 2) {
          // Auto-freeze: missed exactly 1 day (gap=2 means yesterday was missed)
          const missedDate = new Date(streak.last_activity_date + 'T00:00:00Z');
          missedDate.setUTCDate(missedDate.getUTCDate() + 1);
          const missedDateStr = missedDate.toISOString().slice(0, 10);

          await db.insert(
            `UPDATE user_streaks SET freeze_available = 0, freeze_last_used_date = ?, updated_at = ? WHERE user_id = ?`,
            [missedDateStr, new Date().toISOString(), userId]
          );
          streak.freeze_available = 0;
          streak.freeze_last_used_date = missedDateStr;
        } else {
          // Break streak — either no freeze available or missed multiple days
          await db.insert(
            `UPDATE user_streaks SET current_streak = 0, updated_at = ? WHERE user_id = ?`,
            [new Date().toISOString(), userId]
          );
          streak.current_streak = 0;
        }
      }
    }

    // Re-read after potential updates
    streak = (await db.query('SELECT * FROM user_streaks WHERE user_id = ?', [userId]))[0];

    // --- Build weekly calendar ---
    const weekStart = getWeekStart(today);
    const weeklyCalendar = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);

      let status;
      if (dateStr === today) {
        status = streak.last_activity_date === today ? 'completed' : 'today';
      } else if (dateStr > today) {
        status = 'future';
      } else if (streak.freeze_last_used_date === dateStr) {
        status = 'frozen';
      } else if (streak.last_activity_date && dateStr <= streak.last_activity_date) {
        // Check if this day falls within the current or recent streak window
        // Simple heuristic: if we have an active streak, days from
        // (last_activity_date - current_streak + 1) to last_activity_date are completed
        const streakStart = new Date(streak.last_activity_date + 'T00:00:00Z');
        // Account for frozen day in the streak window
        let effectiveStreak = streak.current_streak;
        if (streak.freeze_last_used_date && streak.freeze_last_used_date > streak.last_activity_date) {
          // frozen day is after last activity — don't adjust
        }
        streakStart.setUTCDate(streakStart.getUTCDate() - effectiveStreak + 1);
        const streakStartStr = streakStart.toISOString().slice(0, 10);

        if (dateStr >= streakStartStr && dateStr <= streak.last_activity_date) {
          status = 'completed';
        } else {
          status = 'empty';
        }
      } else if (dateStr < today && streak.current_streak === 0 && streak.last_activity_date) {
        // Streak was broken — past days in this week before today are missed/empty
        // Check if this was the missed day that broke the streak
        const lastAct = streak.last_activity_date;
        const nextDay = new Date(lastAct + 'T00:00:00Z');
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        if (dateStr === nextDay.toISOString().slice(0, 10)) {
          status = 'missed';
        } else {
          status = 'empty';
        }
      } else {
        status = 'empty';
      }

      weeklyCalendar.push({
        date: dateStr,
        dayOfWeek: DAYS_OF_WEEK[i],
        dayNumber: d.getUTCDate(),
        status,
      });
    }

    // Freeze recharge countdown
    let freezeRechargesIn = null;
    if (streak.freeze_available === 0 && streak.freeze_last_used_date) {
      const daysLeft = 7 - daysBetween(streak.freeze_last_used_date, today);
      freezeRechargesIn = Math.max(0, daysLeft);
    }

    return {
      currentStreak: streak.current_streak,
      longestStreak: streak.longest_streak,
      freezeAvailable: streak.freeze_available,
      freezeRechargesIn,
      weeklyCalendar,
      todayCompleted: streak.last_activity_date === today,
      lastActivityDate: streak.last_activity_date,
    };
  },

  async recordActivity(userId) {
    const streak = await this.ensureRow(userId);
    const today = todayStr();

    // Already recorded today — no-op
    if (streak.last_activity_date === today) {
      return this.getStreak(userId);
    }

    let newStreak = streak.current_streak;

    if (!streak.last_activity_date) {
      // First ever activity
      newStreak = 1;
    } else {
      const gap = daysBetween(streak.last_activity_date, today);
      if (gap === 1) {
        // Consecutive day
        newStreak = streak.current_streak + 1;
      } else if (gap === 2 && streak.freeze_last_used_date) {
        // Day after a frozen day — continue streak
        const missedDate = new Date(streak.last_activity_date + 'T00:00:00Z');
        missedDate.setUTCDate(missedDate.getUTCDate() + 1);
        if (streak.freeze_last_used_date === missedDate.toISOString().slice(0, 10)) {
          newStreak = streak.current_streak + 1;
        } else {
          newStreak = 1;
        }
      } else {
        // Gap too large or no freeze — new streak
        newStreak = 1;
      }
    }

    const newLongest = Math.max(streak.longest_streak, newStreak);

    await db.insert(
      `UPDATE user_streaks SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = ? WHERE user_id = ?`,
      [newStreak, newLongest, today, new Date().toISOString(), userId]
    );

    return this.getStreak(userId);
  },
};

module.exports = streakService;
