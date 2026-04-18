import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({
  apiService: {
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

vi.mock('../services/analytics', () => ({
  default: new Proxy({}, { get: (t, p) => { if (!t[p]) t[p] = vi.fn(); return t[p]; } }),
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
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('shows unread badge when there are unread notifications', async () => {
    apiService.getNotifications.mockResolvedValue({
      notifications: [{ id: 1, type: 'review_result', title: 'Test', body: 'Body', read_at: null, created_at: new Date().toISOString() }],
      unreadCount: 3,
    });
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
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
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Review Day 7: 3/4 correct')).toBeInTheDocument());
    expect(screen.getByText('You scored 3 out of 4.')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeInTheDocument());
  });

  it('does not fetch notifications when signed out', async () => {
    render(<MemoryRouter><NotificationBell isAuthenticated={false} /></MemoryRouter>);
    await waitFor(() => expect(apiService.getNotifications).not.toHaveBeenCalled());
  });

  it('makes skill notifications clickable, marks them read, and navigates to the plan page', async () => {
    apiService.getNotifications.mockResolvedValue({
      notifications: [
        { id: 5, type: 'premium_plan_ready', title: 'Your personalized plan is ready', body: 'Days 8-14 for JavaScript', read_at: null, created_at: new Date().toISOString(), data: JSON.stringify({ skillId: 'javascript', startDay: 8, endDay: 14 }) },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotificationBell />} />
          <Route path="/skills/:skillId/plan" element={<div>Plan page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Your personalized plan is ready')).toBeInTheDocument());

    const item = screen.getByRole('link');
    expect(item).toHaveAttribute('href', '/skills/javascript/plan');
    await user.click(item);
    expect(apiService.markNotificationRead).toHaveBeenCalledWith(5);
    await waitFor(() => expect(screen.getByText('Plan page')).toBeInTheDocument());
  });

  it('does not make notifications without skillId clickable', async () => {
    apiService.getNotifications.mockResolvedValue({
      notifications: [
        { id: 6, type: 'subscription_downgraded', title: 'Your Premium plan has ended', body: 'Upgrade anytime.', read_at: null, created_at: new Date().toISOString(), data: null },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Your Premium plan has ended')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
