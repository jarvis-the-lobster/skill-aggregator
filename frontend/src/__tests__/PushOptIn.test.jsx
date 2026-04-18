import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock usePushNotifications hook
const mockPush = {
  isSupported: true,
  isSubscribed: false,
  loading: false,
  requestPermission: vi.fn(),
};
vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => mockPush,
}));

// Mock analytics — Proxy auto-stubs any method call
vi.mock('../services/analytics', () => ({
  default: new Proxy({}, { get: (t, p) => { if (!t[p]) t[p] = vi.fn(); return t[p]; } }),
}));

import { PushOptIn } from '../components/PushOptIn';
import analytics from '../services/analytics';

describe('PushOptIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.isSupported = true;
    mockPush.isSubscribed = false;
    mockPush.loading = false;
    mockPush.requestPermission = vi.fn().mockResolvedValue(true);
    localStorage.clear();
  });

  it('shows banner when push is supported and user not subscribed', () => {
    render(<PushOptIn />);
    expect(screen.getByText(/daily reminders/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable/ })).toBeInTheDocument();
  });

  it('hides when already subscribed', () => {
    mockPush.isSubscribed = true;
    const { container } = render(<PushOptIn />);
    expect(container.innerHTML).toBe('');
  });

  it('hides when dismissed via localStorage', () => {
    localStorage.setItem('push-optin-dismissed', '1');
    const { container } = render(<PushOptIn />);
    expect(container.innerHTML).toBe('');
  });

  it('enable button calls requestPermission', async () => {
    render(<PushOptIn />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Enable/ }));
    expect(mockPush.requestPermission).toHaveBeenCalled();
  });

  it('dismiss button sets localStorage and hides', async () => {
    render(<PushOptIn />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(localStorage.getItem('push-optin-dismissed')).toBe('1');
    expect(analytics.pushOptInDismissed).toHaveBeenCalled();
    expect(screen.queryByText(/daily reminders/)).not.toBeInTheDocument();
  });
});
