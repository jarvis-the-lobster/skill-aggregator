import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api service
vi.mock('../services/api', () => ({
  apiService: {
    getSkillContent: vi.fn(),
    getRatings: vi.fn(),
  },
}));

// Mock analytics
vi.mock('../services/analytics', () => ({
  default: { track: vi.fn() },
}));

// Mock useAuth
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', email: 'test@test.com' } }),
}));

// Mock useEnrollment
vi.mock('../hooks/useCourses', () => ({
  useEnrollment: () => ({
    isEnrolled: false,
    loading: false,
    enroll: vi.fn(),
    unenroll: vi.fn(),
  }),
}));

import { SkillPage } from '../pages/SkillPage';
import { apiService } from '../services/api';
import analytics from '../services/analytics';

function renderSkillPage(skillId = 'python') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/skills/${skillId}`]}>
        <Routes>
          <Route path="/skills/:id" element={<SkillPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

const MOCK_SKILL_RESPONSE = {
  status: 'ready',
  skill: {
    id: 'python',
    name: 'Python',
    description: 'Learn Python programming language',
    category: 'programming',
    difficulty: 'beginner',
    estimatedHours: 40,
  },
  content: {
    videos: [
      {
        id: 'vid1',
        title: 'Python Tutorial for Beginners',
        description: 'A comprehensive Python tutorial',
        channel: 'TechChannel',
        source: 'youtube',
        duration: '1:30:00',
        views: 1234567,
        rating: 4.8,
        url: 'https://youtube.com/watch?v=vid1',
        thumbnail: 'https://img.youtube.com/vi/vid1/0.jpg',
      },
    ],
    articles: [
      {
        id: 'art1',
        title: 'Python Guide',
        description: 'An in-depth Python guide',
        source: 'RealPython',
        author: 'John Doe',
        readTime: '15 min',
        publishedDate: '2026-01-15',
        url: 'https://realpython.com/guide',
      },
    ],
    lastScrapedAt: '2026-03-20T00:00:00Z',
  },
};

describe('SkillPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiService.getSkillContent.mockResolvedValue(MOCK_SKILL_RESPONSE);
    apiService.getRatings.mockResolvedValue({ counts: {}, userRatings: {} });
  });

  it('renders skill name and description', async () => {
    renderSkillPage();
    expect(await screen.findByText('Python')).toBeInTheDocument();
    expect(screen.getByText('Learn Python programming language')).toBeInTheDocument();
  });

  it('shows video and article tabs', async () => {
    renderSkillPage();
    await screen.findByText('Python');
    expect(screen.getByText(/Videos \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Articles \(1\)/)).toBeInTheDocument();
  });

  it('enroll button visible when not enrolled', async () => {
    renderSkillPage();
    await screen.findByText('Python');
    expect(screen.getByText(/Enroll in this Course/)).toBeInTheDocument();
  });

  it('formats view counts correctly (1234567 → 1.2M views)', async () => {
    renderSkillPage();
    await screen.findByText('Python');
    expect(screen.getByText('1.2M views')).toBeInTheDocument();
  });

  it('content link click triggers analytics event', async () => {
    renderSkillPage();
    await screen.findByText('Python');

    const watchLink = screen.getByRole('link', { name: /Watch/ });
    const user = userEvent.setup();
    await user.click(watchLink);

    expect(analytics.track).toHaveBeenCalledWith('content_link_clicked', expect.objectContaining({
      skillId: 'python',
      contentId: 'vid1',
      type: 'video',
    }));
  });
});
