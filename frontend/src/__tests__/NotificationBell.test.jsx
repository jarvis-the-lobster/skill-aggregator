import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({
  apiService: {
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

import { NotificationBell } from '../components/NotificationBell';
import { apiService } from '../services/api';

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  apiService.markNotificationRead.mockResolvedValue({ ok: true });
  apiService.markAllNotificationsRead.mockResolvedValue({ ok: true });
});

describe('NotificationBell', () => {
  it('renders bell icon', async () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('shows unread badge when there are unread notifications', async () => {
    apiService.getNotifications.mockResolvedValue({
      notifications: [{ id: 1, type: 'review_result', title: 'Test', body: 'Body', read_at: null, created_at: new Date().toISOString() }],
      unreadCount: 3,
    });
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('opens dropdown on click and shows notifications', async () => {
    apiService.getNotifications.mockResolvedValue({
      notifications: [
        { id: 1, type: 'review_result', title: 'Review Day 7: 3/4 correct', body: 'You scored 3 out of 4.', read_at: null, created_at: new Date().toISOString() },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Review Day 7: 3/4 correct')).toBeInTheDocument());
    expect(screen.getByText('You scored 3 out of 4.')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument());
  });
});
