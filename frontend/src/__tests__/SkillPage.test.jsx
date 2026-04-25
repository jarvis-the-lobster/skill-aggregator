import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock api service
vi.mock('../services/api', () => ({
  apiService: {
    getSkillContent: vi.fn(),
    getRatings: vi.fn(),
  },
}));

// Mock analytics — Proxy auto-stubs any method call
vi.mock('../services/analytics', () => ({
  default: new Proxy({}, { get: (t, p) => { if (!t[p]) t[p] = vi.fn(); return t[p]; } }),
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
import { SKILL_PAGE_CONTENT_LIMIT } from '../utils/skillContent';

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
    vi.useRealTimers();
    vi.clearAllMocks();
    apiService.getSkillContent.mockReset();
    apiService.getRatings.mockReset();
    apiService.getSkillContent.mockResolvedValue(MOCK_SKILL_RESPONSE);
    apiService.getRatings.mockResolvedValue({ counts: {}, userRatings: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
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

    expect(analytics.contentLinkClicked).toHaveBeenCalledWith(
      'python', 'vid1', 'video', expect.any(String)
    );
  });


  it('stops polling after a 429 instead of retrying forever', async () => {
    vi.useFakeTimers();
    const pendingResponse = {
      status: 'scraping',
      skill: MOCK_SKILL_RESPONSE.skill,
      content: { videos: [], articles: [], lastScrapedAt: null },
    };

    apiService.getSkillContent
      .mockResolvedValueOnce(pendingResponse)
      .mockRejectedValueOnce({ response: { status: 429 } });

    renderSkillPage();

    await Promise.resolve();
    await Promise.resolve();
    expect(apiService.getSkillContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(apiService.getSkillContent).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(apiService.getSkillContent).toHaveBeenCalledTimes(2);
  }, 10000);

  it('caps visible videos and articles to keep the page focused', async () => {
    const manyItemsResponse = {
      ...MOCK_SKILL_RESPONSE,
      content: {
        ...MOCK_SKILL_RESPONSE.content,
        videos: Array.from({ length: 9 }, (_, i) => ({
          id: `vid${i + 1}`,
          title: `Python Video ${i + 1}`,
          description: `Video description ${i + 1}`,
          channel: 'TechChannel',
          source: 'youtube',
          duration: '10:00',
          views: 1000 + i,
          rating: 4.5,
          url: `https://youtube.com/watch?v=vid${i + 1}`,
          thumbnail: `https://img.youtube.com/vi/vid${i + 1}/0.jpg`,
        })),
        articles: Array.from({ length: 9 }, (_, i) => ({
          id: `art${i + 1}`,
          title: `Python Article ${i + 1}`,
          description: `Article description ${i + 1}`,
          source: 'RealPython',
          author: 'John Doe',
          readTime: '15 min',
          publishedDate: '2026-01-15',
          url: `https://realpython.com/article-${i + 1}`,
        })),
      },
    };

    apiService.getSkillContent.mockResolvedValue(manyItemsResponse);

    renderSkillPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Python')).toBeInTheDocument();
    expect(screen.getByText(`Videos (${SKILL_PAGE_CONTENT_LIMIT} of 9)`)).toBeInTheDocument();
    expect(screen.getByText(`Showing ${SKILL_PAGE_CONTENT_LIMIT} of 9 videos.`)).toBeInTheDocument();
    expect(screen.getByText(`Python Video ${SKILL_PAGE_CONTENT_LIMIT}`)).toBeInTheDocument();
    expect(screen.queryByText(`Python Video ${SKILL_PAGE_CONTENT_LIMIT + 1}`)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: new RegExp(`Articles \\(${SKILL_PAGE_CONTENT_LIMIT} of 9\\)`) }));

    expect(screen.getByText(`Showing ${SKILL_PAGE_CONTENT_LIMIT} of 9 articles.`)).toBeInTheDocument();
    expect(screen.getByText(`Python Article ${SKILL_PAGE_CONTENT_LIMIT}`)).toBeInTheDocument();
    expect(screen.queryByText(`Python Article ${SKILL_PAGE_CONTENT_LIMIT + 1}`)).not.toBeInTheDocument();
  });
});
