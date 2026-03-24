import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useStreak hook
const mockStreakData = { streak: null, loading: false };
vi.mock('../hooks/useStreak', () => ({
  useStreak: () => mockStreakData,
}));

import { StreakBadge } from '../components/StreakBadge';

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('StreakBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreakData.streak = null;
    mockStreakData.loading = false;
  });

  it('shows "Start a streak" for new users', () => {
    mockStreakData.streak = {
      currentStreak: 0,
      lastActivityDate: null,
      freezeAvailable: false,
      freezeRechargesIn: null,
      weeklyCalendar: [],
      todayCompleted: false,
    };
    renderWithRouter(<StreakBadge />);
    expect(screen.getByText('Start a streak')).toBeInTheDocument();
  });

  it('shows streak count for active streak', () => {
    mockStreakData.streak = {
      currentStreak: 5,
      lastActivityDate: '2026-03-22',
      freezeAvailable: true,
      freezeRechargesIn: null,
      weeklyCalendar: [],
      todayCompleted: true,
    };
    renderWithRouter(<StreakBadge />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('shows countdown timer when today not completed', () => {
    mockStreakData.streak = {
      currentStreak: 3,
      lastActivityDate: '2026-03-22',
      freezeAvailable: false,
      freezeRechargesIn: 5,
      weeklyCalendar: [],
      todayCompleted: false,
    };
    renderWithRouter(<StreakBadge />);
    expect(screen.getByText('3')).toBeInTheDocument();
    // Countdown timer should contain "h" and "m"
    expect(screen.getByText(/\d+h \d+m/)).toBeInTheDocument();
  });

  it('shows "saved" state when freeze was used', () => {
    mockStreakData.streak = {
      currentStreak: 7,
      lastActivityDate: '2026-03-22',
      freezeAvailable: false,
      freezeRechargesIn: 3,
      weeklyCalendar: [{ date: '2026-03-20', status: 'frozen' }],
      todayCompleted: false,
    };
    renderWithRouter(<StreakBadge />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/saved/)).toBeInTheDocument();
  });

  it('all states render as clickable links to /my-courses', () => {
    mockStreakData.streak = {
      currentStreak: 5,
      lastActivityDate: '2026-03-22',
      freezeAvailable: true,
      freezeRechargesIn: null,
      weeklyCalendar: [],
      todayCompleted: true,
    };
    renderWithRouter(<StreakBadge />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/my-courses');
  });
});
