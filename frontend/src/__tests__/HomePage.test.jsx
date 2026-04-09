import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api service
vi.mock('../services/api', () => ({
  apiService: {
    getSkills: vi.fn(),
    getSkillStats: vi.fn(),
    getSkillContentCounts: vi.fn(),
    searchSkill: vi.fn(),
  },
}));

// Mock analytics
vi.mock('../services/analytics', () => ({
  default: { track: vi.fn() },
}));

// Mock useAuth
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn() }),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { HomePage } from '../pages/HomePage';
import { apiService } from '../services/api';
import analytics from '../services/analytics';

function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </HelmetProvider>
  );
}

const MOCK_SKILLS = [
  { id: 'python', name: 'Python', description: 'Learn Python programming', category: 'programming', status: 'ready', difficulty: 'beginner' },
  { id: 'javascript', name: 'JavaScript', description: 'Learn JS', category: 'programming', status: 'ready', difficulty: 'beginner' },
  { id: 'data-science', name: 'Data Science', description: 'Analyze data', category: 'programming', status: 'ready', difficulty: 'intermediate' },
];

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiService.getSkills.mockResolvedValue({ skills: MOCK_SKILLS });
    apiService.getSkillStats.mockResolvedValue({ stats: { totalVideos: 10, totalArticles: 5 } });
    apiService.getSkillContentCounts.mockResolvedValue({ counts: {} });
  });

  it('renders homepage with updated hero copy', async () => {
    renderWithRouter(<HomePage />);
    expect(await screen.findByText(/Learn any skill with/i)).toBeInTheDocument();
    expect(screen.getByText(/a clear 30-day plan\./i)).toBeInTheDocument();
    expect(screen.getByText(/Find the best free videos and articles/i)).toBeInTheDocument();
  });

  it('shows featured skill cards', async () => {
    renderWithRouter(<HomePage />);
    expect(await screen.findByText('Python Programming')).toBeInTheDocument();
    expect(screen.getAllByText('JavaScript').length).toBeGreaterThan(0);
  });

  it('search bar is visible and functional', async () => {
    renderWithRouter(<HomePage />);
    await screen.findByText('Python Programming');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    expect(searchInput).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(searchInput, 'Python');
    expect(searchInput).toHaveValue('Python');
  });

  it('skill card links to skill page', async () => {
    renderWithRouter(<HomePage />);
    const pythonCard = await screen.findByText('Python Programming');
    const link = pythonCard.closest('a');
    expect(link).toHaveAttribute('href', '/skills/python');
  });

  it('search submit triggers analytics and navigation', async () => {
    apiService.searchSkill.mockResolvedValue({ skill: { id: 'python', name: 'Python' } });
    renderWithRouter(<HomePage />);
    await screen.findByText('Python Programming');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    const user = userEvent.setup();
    await user.type(searchInput, 'python{Enter}');
    expect(analytics.track).toHaveBeenCalledWith('search_query_typed', expect.objectContaining({ query: 'python' }));
    expect(mockNavigate).toHaveBeenCalledWith('/skills/python');
  });

  it('shows error for blocked search terms', async () => {
    apiService.searchSkill.mockResolvedValue({ skill: null, status: 'blocked', message: 'This search term is not allowed.' });
    renderWithRouter(<HomePage />);
    await screen.findByText('Python Programming');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    const user = userEvent.setup();
    await user.type(searchInput, 'badterm{Enter}');
    expect(await screen.findByText('This search term is not allowed.')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows error for rate-limited search', async () => {
    apiService.searchSkill.mockResolvedValue({ skill: null, status: 'rate_limited', message: 'Too many new skill requests.' });
    renderWithRouter(<HomePage />);
    await screen.findByText('Python Programming');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    const user = userEvent.setup();
    await user.type(searchInput, 'newskill{Enter}');
    expect(await screen.findByText('Too many new skill requests.')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
