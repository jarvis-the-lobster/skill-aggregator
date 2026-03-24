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
    searchSkill: vi.fn(),
  },
}));

// Mock analytics
vi.mock('../services/analytics', () => ({
  default: { track: vi.fn() },
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
  });

  it('renders homepage with title LearnStack', async () => {
    renderWithRouter(<HomePage />);
    expect(await screen.findByText(/Learn any skill/)).toBeInTheDocument();
    expect(screen.getByText(/resources on the internet/)).toBeInTheDocument();
  });

  it('shows featured skill cards', async () => {
    renderWithRouter(<HomePage />);
    expect(await screen.findByText('Python')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
  });

  it('search bar is visible and functional', async () => {
    renderWithRouter(<HomePage />);
    await screen.findByText('Python');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    expect(searchInput).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(searchInput, 'Python');
    expect(searchInput).toHaveValue('Python');
  });

  it('skill card click triggers analytics', async () => {
    renderWithRouter(<HomePage />);
    const pythonCard = await screen.findByText('Python');
    const user = userEvent.setup();
    await user.click(pythonCard.closest('a'));
    expect(analytics.track).toHaveBeenCalledWith('skill_card_clicked', expect.objectContaining({ skillId: 'python' }));
  });

  it('search filters displayed skills while typing', async () => {
    renderWithRouter(<HomePage />);
    await screen.findByText('Python');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    const user = userEvent.setup();
    await user.type(searchInput, 'data');
    // Data Science should match, JavaScript should be filtered out
    expect(screen.getAllByText('Data Science').length).toBeGreaterThan(0);
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
  });

  it('search submit triggers analytics and navigation', async () => {
    apiService.searchSkill.mockResolvedValue({ skill: { id: 'python', name: 'Python' } });
    renderWithRouter(<HomePage />);
    await screen.findByText('Python');
    const searchInput = screen.getByPlaceholderText(/Search Python/);
    const user = userEvent.setup();
    await user.type(searchInput, 'python{Enter}');
    expect(analytics.track).toHaveBeenCalledWith('search_query_typed', expect.objectContaining({ query: 'python' }));
    expect(mockNavigate).toHaveBeenCalledWith('/skills/python');
  });
});
