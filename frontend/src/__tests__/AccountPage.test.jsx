import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
const mockUseSubscription = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: (...args) => mockUseAuth(...args),
}));

vi.mock('../hooks/useSubscription', () => ({
  useSubscription: (...args) => mockUseSubscription(...args),
}));

vi.mock('../services/analytics', () => ({
  default: new Proxy({}, { get: (t, p) => { if (!t[p]) t[p] = vi.fn(); return t[p]; } }),
}));

import { AccountPage } from '../pages/AccountPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: 'trial@example.com', name: 'Trial User' },
      loading: false,
    });
  });

  it('shows explicit cancelled-trial messaging instead of renewal copy', () => {
    mockUseSubscription.mockReturnValue({
      status: 'active',
      subscriptionEndDate: '2026-04-28T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      isTrialing: true,
      loading: false,
      refresh: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Premium Trial')).toBeInTheDocument();
    expect(screen.getByText('Trial ends on')).toBeInTheDocument();
    expect(screen.getByText(/will end automatically/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume premium after trial/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel subscription/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Renews on')).not.toBeInTheDocument();
  });

  it('keeps normal renewal messaging for active subscriptions that are not cancelled trials', () => {
    mockUseSubscription.mockReturnValue({
      status: 'active',
      subscriptionEndDate: '2026-05-28T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      isTrialing: false,
      loading: false,
      refresh: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('Renews on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
    expect(screen.queryByText('Trial ends on')).not.toBeInTheDocument();
  });

  it('treats expired cancelled subscriptions as free instead of showing stale premium cancellation copy', () => {
    mockUseSubscription.mockReturnValue({
      status: 'cancelled',
      subscriptionEndDate: null,
      cancelAtPeriodEnd: false,
      isTrialing: false,
      loading: false,
      refresh: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Free plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
    expect(screen.queryByText('Cancels at period end')).not.toBeInTheDocument();
    expect(screen.queryByText(/Your subscription is cancelled\./i)).not.toBeInTheDocument();
    expect(screen.queryByText('Ends on')).not.toBeInTheDocument();
  });
});
