const { createTestDb, clearTables } = require('./helpers/testDb');

const mockDb = {};
jest.mock('../models/database', () => mockDb);

// Only fake Date — leave timers alone so sqlite3 callbacks work
jest.useFakeTimers({
  doNotFake: [
    'nextTick', 'setImmediate', 'setTimeout', 'setInterval',
    'clearTimeout', 'clearInterval', 'queueMicrotask',
  ],
});

const streakService = require('../services/streakService');

let db;
const USER_ID = 1;

// Helper: set "today" in Pacific time by setting UTC to noon Pacific (8pm UTC in winter)
function setToday(dateStr) {
  jest.setSystemTime(new Date(`${dateStr}T20:00:00Z`));
}

beforeAll(async () => {
  db = await createTestDb();
  Object.assign(mockDb, db);
});

beforeEach(async () => {
  await clearTables(db);
  // Create a test user
  await db.insert(
    "INSERT INTO users (id, email, password_hash) VALUES (?, 'test@test.com', 'hash')",
    [USER_ID]
  );
  setToday('2024-01-15');
});

afterAll(async () => {
  jest.useRealTimers();
  await db.close();
});

describe('recordActivity', () => {
  test('creates streak on first activity (current_streak = 1)', async () => {
    const result = await streakService.recordActivity(USER_ID);
    expect(result.currentStreak).toBe(1);
    expect(result.todayCompleted).toBe(true);
  });

  test('increments streak on consecutive days', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    setToday('2024-01-16');
    const result = await streakService.recordActivity(USER_ID);
    expect(result.currentStreak).toBe(2);
  });

  test('is idempotent — same day is a no-op', async () => {
    await streakService.recordActivity(USER_ID);
    const result = await streakService.recordActivity(USER_ID);
    expect(result.currentStreak).toBe(1);
    expect(result.todayCompleted).toBe(true);
  });
});

describe('getStreak', () => {
  test('returns active streak when last activity was yesterday', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    setToday('2024-01-16');
    const result = await streakService.getStreak(USER_ID);
    // Streak should still be 1 (not broken, but not incremented until activity today)
    expect(result.currentStreak).toBe(1);
    expect(result.todayCompleted).toBe(false);
  });

  test('auto-freezes when gap is 2 days and freeze available', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    // Skip a day — gap of 2 (Jan 15 → Jan 17)
    setToday('2024-01-17');
    const result = await streakService.getStreak(USER_ID);
    // Streak preserved via auto-freeze, freeze consumed
    expect(result.currentStreak).toBe(1);
    expect(result.freezeAvailable).toBe(0);
  });

  test('breaks streak when gap is 2+ days and no freeze', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    // Use up the freeze — set used date recent enough that it won't recharge by Jan 17
    await db.insert(
      "UPDATE user_streaks SET freeze_available = 0, freeze_last_used_date = '2024-01-14' WHERE user_id = ?",
      [USER_ID]
    );

    // Skip a day with no freeze available (gap=2, freeze won't recharge until Jan 21)
    setToday('2024-01-17');
    const result = await streakService.getStreak(USER_ID);
    expect(result.currentStreak).toBe(0);
  });

  test('breaks streak when gap is 3+ days regardless of freeze', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    // Gap of 3 days (Jan 15 → Jan 18) — freeze can't help with multiple missed days
    setToday('2024-01-18');
    const result = await streakService.getStreak(USER_ID);
    expect(result.currentStreak).toBe(0);
  });

  test('recharges freeze after 7 days', async () => {
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);
    setToday('2024-01-16');
    await streakService.recordActivity(USER_ID);

    // Use freeze on Jan 9 — by Jan 17 it will be 8 days (>= 7), triggering recharge
    await db.insert(
      "UPDATE user_streaks SET freeze_available = 0, freeze_last_used_date = '2024-01-09' WHERE user_id = ?",
      [USER_ID]
    );

    // Gap from last activity (Jan 16) to today (Jan 17) is 1 — streak is active, no freeze consumed
    setToday('2024-01-17');
    const result = await streakService.getStreak(USER_ID);
    expect(result.freezeAvailable).toBe(1);
  });
});

describe('weeklyCalendar', () => {
  test('returns correct statuses for the week', async () => {
    // Wednesday Jan 17 — week starts Monday Jan 15
    setToday('2024-01-15');
    await streakService.recordActivity(USER_ID);

    setToday('2024-01-16');
    await streakService.recordActivity(USER_ID);

    setToday('2024-01-17');
    const result = await streakService.getStreak(USER_ID);

    expect(result.weeklyCalendar).toHaveLength(7);
    // Mon Jan 15 = completed, Tue Jan 16 = completed, Wed Jan 17 = today (not yet completed)
    expect(result.weeklyCalendar[0].status).toBe('completed'); // Mon
    expect(result.weeklyCalendar[1].status).toBe('completed'); // Tue
    expect(result.weeklyCalendar[2].status).toBe('today');     // Wed (not done yet)
    expect(result.weeklyCalendar[3].status).toBe('future');    // Thu
    expect(result.weeklyCalendar[4].status).toBe('future');    // Fri
  });
});
