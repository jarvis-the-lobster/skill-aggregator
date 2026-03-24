import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStreakData = { streak: null, loading: false };
vi.mock('../hooks/useStreak', () => ({
  useStreak: () => mockStreakData,
}));

import { StreakWidget } from '../components/StreakWidget';

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const makeWeeklyCalendar = (overrides = []) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((dayOfWeek, i) => ({
    date: `2026-03-${17 + i}`,
    dayOfWeek,
    dayNumber: 17 + i,
    status: 'empty',
    ...overrides[i],
  }));
};

describe('StreakWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreakData.streak = null;
    mockStreakData.loading = false;
  });

  it('shows weekly calendar with correct day statuses', () => {
    mockStreakData.streak = {
      currentStreak: 3,
      lastActivityDate: '2026-03-22',
      freezeAvailable: true,
      freezeRechargesIn: null,
      weeklyCalendar: makeWeeklyCalendar([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'today' },
      ]),
      todayCompleted: false,
      longestStreak: 5,
    };
    renderWithRouter(<StreakWidget />);
    // Calendar rendered with 7 day numbers
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });

  it('shows "Start your streak" CTA for new users', () => {
    mockStreakData.streak = {
      currentStreak: 0,
      lastActivityDate: null,
      freezeAvailable: false,
      freezeRechargesIn: null,
      weeklyCalendar: makeWeeklyCalendar(),
      todayCompleted: false,
      longestStreak: 0,
    };
    renderWithRouter(<StreakWidget />);
    expect(screen.getByText('Start your learning streak')).toBeInTheDocument();
    expect(screen.getByText('Browse Skills')).toBeInTheDocument();
  });

  it('shows "Continue your streak" for active users with incomplete today', () => {
    mockStreakData.streak = {
      currentStreak: 5,
      lastActivityDate: '2026-03-22',
      freezeAvailable: true,
      freezeRechargesIn: null,
      weeklyCalendar: makeWeeklyCalendar([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'today' },
      ]),
      todayCompleted: false,
      longestStreak: 5,
    };
    renderWithRouter(<StreakWidget />);
    expect(screen.getByText('Continue your streak')).toBeInTheDocument();
    expect(screen.getByText("Start Today's Lesson")).toBeInTheDocument();
  });

  it('shows completion celebration when today is done', () => {
    mockStreakData.streak = {
      currentStreak: 6,
      lastActivityDate: '2026-03-23',
      freezeAvailable: true,
      freezeRechargesIn: null,
      weeklyCalendar: makeWeeklyCalendar([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
        { status: 'completed' },
      ]),
      todayCompleted: true,
      longestStreak: 6,
    };
    renderWithRouter(<StreakWidget />);
    expect(screen.getByText(/6-day streak!/)).toBeInTheDocument();
    expect(screen.getByText(/Day 6 complete!/)).toBeInTheDocument();
  });

  it('shows freeze info when auto-freeze was used', () => {
    mockStreakData.streak = {
      currentStreak: 4,
      lastActivityDate: '2026-03-21',
      freezeAvailable: false,
      freezeRechargesIn: 5,
      weeklyCalendar: makeWeeklyCalendar([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'frozen' },
        { status: 'today' },
      ]),
      todayCompleted: false,
      longestStreak: 4,
    };
    renderWithRouter(<StreakWidget />);
    expect(screen.getByText(/Streak saved!/)).toBeInTheDocument();
    expect(screen.getByText(/Freeze recharges in 5 days/)).toBeInTheDocument();
  });

  it('shows "Start a new streak" when streak is broken', () => {
    mockStreakData.streak = {
      currentStreak: 0,
      lastActivityDate: '2026-03-20',
      freezeAvailable: false,
      freezeRechargesIn: 3,
      weeklyCalendar: makeWeeklyCalendar([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'missed' },
        { status: 'today' },
      ]),
      todayCompleted: false,
      longestStreak: 10,
    };
    renderWithRouter(<StreakWidget />);
    expect(screen.getByText('Start a new streak')).toBeInTheDocument();
    expect(screen.getByText(/10-day streak lost/)).toBeInTheDocument();
  });
});
