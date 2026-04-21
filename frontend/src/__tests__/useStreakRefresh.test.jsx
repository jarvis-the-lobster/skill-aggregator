import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetStreak = vi.fn();

vi.mock('../services/api', () => ({
  apiService: {
    getStreak: (...args) => mockGetStreak(...args),
  },
}));

const stableUser = { id: 1, email: 'test@test.com' };

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
  AuthProvider: ({ children }) => children,
}));

import { StreakProvider } from '../contexts/StreakContext';
import { useStreak } from '../hooks/useStreak';

function Probe() {
  const { streak, loading, refresh } = useStreak();

  if (loading) return <div>loading</div>;
  if (!streak) return <div>empty</div>;

  return (
    <div>
      <span>{`${streak.currentStreak}-${streak.todayCompleted ? 'done' : 'pending'}`}</span>
      <button onClick={refresh}>refresh</button>
    </div>
  );
}

describe('StreakProvider shared refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides streak data and updates when refresh is called', async () => {
    let callCount = 0;
    mockGetStreak.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          currentStreak: 3,
          todayCompleted: false,
          freezeAvailable: true,
          freezeRechargesIn: null,
          weeklyCalendar: [],
          lastActivityDate: '2026-04-20T12:00:00Z',
        });
      }
      return Promise.resolve({
        currentStreak: 4,
        todayCompleted: true,
        freezeAvailable: true,
        freezeRechargesIn: null,
        weeklyCalendar: [],
        lastActivityDate: '2026-04-21T12:00:00Z',
      });
    });

    const user = userEvent.setup();

    render(
      <StreakProvider>
        <Probe />
      </StreakProvider>
    );

    expect(await screen.findByText('3-pending')).toBeInTheDocument();

    await user.click(screen.getByText('refresh'));

    expect(await screen.findByText('4-done')).toBeInTheDocument();
  });

  it('throws when useStreak is used outside StreakProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Bare() {
      useStreak();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useStreak must be used within a StreakProvider');
    spy.mockRestore();
  });
});
