import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useAuth
const mockAuth = {
  login: vi.fn(),
  register: vi.fn(),
  loginWithGoogle: vi.fn(),
  user: null,
  loading: false,
};
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// Mock analytics
vi.mock('../services/analytics', () => ({
  default: { track: vi.fn() },
}));

import { SignupPage } from '../pages/SignupPage';
import { LoginPage } from '../pages/LoginPage';

function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    renderWithRouter(<SignupPage />);
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
  });

  it('validates email format', async () => {
    renderWithRouter(<SignupPage />);
    const user = userEvent.setup();

    // Use a value that passes HTML5 type="email" but fails the app's regex (requires a dot after @)
    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@nodot');
    await user.type(screen.getByPlaceholderText('••••••••'), 'validpassword123');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it('validates password length', async () => {
    renderWithRouter(<SignupPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'short');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockAuth.register).not.toHaveBeenCalled();
  });
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in$/i })).toBeInTheDocument();
  });

  it('shows OAuth error when URL has error param', () => {
    renderWithRouter(<LoginPage />, { route: '/login?error=oauth' });
    expect(screen.getByText(/Google sign-in failed/i)).toBeInTheDocument();
  });
});
