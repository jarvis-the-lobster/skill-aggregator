import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api service
const mockGetLearningPlan = vi.fn();
const mockGetSkillContent = vi.fn();
const mockGetPlanProgress = vi.fn();
const mockGetRatings = vi.fn();
const mockEnrollLearningPlan = vi.fn();
const mockRefreshPlan = vi.fn();
const mockCompletePlanDay = vi.fn();

vi.mock('../services/api', () => ({
  apiService: {
    getLearningPlan: (...args) => mockGetLearningPlan(...args),
    getSkillContent: (...args) => mockGetSkillContent(...args),
    getPlanProgress: (...args) => mockGetPlanProgress(...args),
    getRatings: (...args) => mockGetRatings(...args),
    enrollLearningPlan: (...args) => mockEnrollLearningPlan(...args),
    refreshPlan: (...args) => mockRefreshPlan(...args),
    completePlanDay: (...args) => mockCompletePlanDay(...args),
  },
}));

vi.mock('../services/analytics', () => ({
  default: { track: vi.fn() },
}));

// Default: logged-in user with auth loaded
const mockUseAuth = vi.fn(() => ({ user: { id: 1, email: 'test@test.com' }, loading: false }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: (...args) => mockUseAuth(...args),
}));

import { LearningPlanPage } from '../pages/LearningPlanPage';

// --- Test data ---

const SHARED_PLAN = Array.from({ length: 30 }, (_, i) => ({
  day_number: i + 1,
  content_id: `shared_content_${i + 1}`,
  content_type: i < 7 ? 'video' : 'article',
  title: `Shared Resource ${i + 1}`,
  url: `https://example.com/shared/${i + 1}`,
  source: i < 7 ? 'YouTube' : 'Dev.to',
  reason: 'Curated content',
}));

const PERSONAL_PLAN = Array.from({ length: 30 }, (_, i) => ({
  day_number: i + 1,
  content_id: `personal_content_${i + 1}`,
  content_type: i < 7 ? 'video' : 'article',
  title: `My Resource ${i + 1}`,
  url: `https://example.com/personal/${i + 1}`,
  source: i < 7 ? 'YouTube' : 'Dev.to',
  reason: 'Your curated content',
}));

const REFRESHED_PLAN = PERSONAL_PLAN.map((day, i) => {
  // Days 1, 2, 8 stay the same (completed), others get new content
  if ([1, 2, 8].includes(day.day_number)) return day;
  return {
    ...day,
    content_id: `refreshed_content_${i + 1}`,
    title: `Updated Resource ${i + 1}`,
  };
});

const SKILL_RESPONSE = {
  skill: { id: 'python', name: 'Python' },
  content: { videos: [], articles: [] },
};

function renderPlanPage(skillId = 'python') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/skills/${skillId}/plan`]}>
        <Routes>
          <Route path="/skills/:skillId/plan" element={<LearningPlanPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('LearningPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'test@test.com' }, loading: false });
    mockGetSkillContent.mockResolvedValue(SKILL_RESPONSE);
    mockGetRatings.mockResolvedValue({ counts: {}, userRatings: {} });
  });

  describe('enrolled user sees personal plan', () => {
    it('displays personal plan content instead of shared plan', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[]' },
        plan: PERSONAL_PLAN,
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      // Should show personal plan titles, not shared
      expect(await screen.findByText('My Resource 1')).toBeInTheDocument();
      expect(screen.queryByText('Shared Resource 1')).not.toBeInTheDocument();
    });

    it('shows completed days from progress', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[1, 2, 8]' },
        plan: PERSONAL_PLAN,
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      await screen.findByText('My Resource 1');

      // Completed days should not show "Mark complete" button.
      // In this fixture, day 7 still has personal content so it remains completable.
      const markCompleteButtons = screen.getAllByText('Mark complete');
      expect(markCompleteButtons).toHaveLength(27);
    });

    it('does not fall back to shared plan when enrolled response returns an empty personal plan', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: false, reviewContent: { 7: { title: 'Shared review', body: { summary: 'shared' } } } });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[]' },
        plan: [],
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      await waitFor(() => {
        expect(mockGetPlanProgress).toHaveBeenCalled();
      });

      expect(screen.queryByText('Shared Resource 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Generating review content. Check back within 24 hours.')).not.toBeInTheDocument();
    });

    it('renders real personal-plan content on day 7 instead of forcing a review card', async () => {
      const personalPlan = PERSONAL_PLAN.map((day) =>
        day.day_number === 7
          ? {
              ...day,
              content_id: 'yt_J2j1yk-34OY',
              content_type: 'video',
              title: 'Complete React Native Tutorial #1 - Introduction & Setup (Expo)',
              url: 'https://www.youtube.com/watch?v=J2j1yk-34OY',
            }
          : day
      );

      mockGetLearningPlan.mockResolvedValue({
        plan: SHARED_PLAN,
        planReady: false,
        reviewContent: { 7: { title: 'Shared review that should be ignored', body: { summary: 'shared' } } },
      });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[4,10,9]' },
        plan: personalPlan,
        refreshAvailable: false,
        planReady: false,
        reviewContent: { 7: { title: 'Shared review that should be ignored', body: { summary: 'shared' } } },
      });

      renderPlanPage();

      expect(await screen.findByText('Complete React Native Tutorial #1 - Introduction & Setup (Expo)')).toBeInTheDocument();
      expect(screen.queryByText('Generating review content. Check back within 24 hours.')).not.toBeInTheDocument();
      expect(screen.queryByText('Your plan is being finalized')).not.toBeInTheDocument();
      expect(screen.queryByText('Shared review that should be ignored')).not.toBeInTheDocument();
      expect(screen.queryByText(/Day 7.*Check-in/)).not.toBeInTheDocument();
    });
  });

  describe('non-enrolled user sees shared plan', () => {
    it('displays shared plan when not enrolled', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: false,
        progress: null,
        plan: null,
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      // Should show shared plan (only first 7 days for free preview)
      expect(await screen.findByText('Shared Resource 1')).toBeInTheDocument();
      expect(screen.queryByText('My Resource 1')).not.toBeInTheDocument();
    });
  });

  describe('refresh banner', () => {
    it('shows refresh banner when new content is available', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[1, 2, 8]' },
        plan: PERSONAL_PLAN,
        refreshAvailable: true,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      expect(await screen.findByText('New resources available!')).toBeInTheDocument();
      expect(screen.getByText('Update Plan')).toBeInTheDocument();
    });

    it('does not show refresh banner when no new content', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[1, 2, 8]' },
        plan: PERSONAL_PLAN,
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      await screen.findByText('My Resource 1');
      expect(screen.queryByText('New resources available!')).not.toBeInTheDocument();
    });

    it('clicking Update Plan refreshes with preserved completed content', async () => {
      mockGetLearningPlan.mockResolvedValue({ plan: SHARED_PLAN, planReady: true, reviewContent: {} });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: true,
        progress: { completed_days: '[1, 2, 8]' },
        plan: PERSONAL_PLAN,
        refreshAvailable: true,
        planReady: true,
        reviewContent: {},
      });
      mockRefreshPlan.mockResolvedValue({
        refreshed: true,
        plan: REFRESHED_PLAN,
      });

      renderPlanPage();

      const updateBtn = await screen.findByText('Update Plan');
      const user = userEvent.setup();
      await user.click(updateBtn);

      await waitFor(() => {
        expect(mockRefreshPlan).toHaveBeenCalledWith('python');
      });

      // After refresh: completed days (1, 2, 8) should keep personal content
      expect(await screen.findByText('My Resource 1')).toBeInTheDocument();   // day 1 preserved
      expect(screen.getByText('My Resource 2')).toBeInTheDocument();          // day 2 preserved
      expect(screen.getByText('My Resource 8')).toBeInTheDocument();          // day 8 preserved

      // Incomplete days should show updated content
      expect(screen.getByText('Updated Resource 3')).toBeInTheDocument();     // day 3 refreshed

      // Banner should be gone
      expect(screen.queryByText('New resources available!')).not.toBeInTheDocument();
    });
  });

  describe('review day placeholders', () => {
    it('shows review generation copy instead of stale content on pending review days', async () => {
      const sharedPlanWithReviewPlaceholder = SHARED_PLAN.map((day) =>
        [7, 14, 21, 28].includes(day.day_number)
          ? {
              ...day,
              content_id: null,
              content_type: 'review',
              title: null,
              url: null,
              review_status: 'pending',
              review_title: null,
              review_body: null,
            }
          : day
      );

      mockGetLearningPlan.mockResolvedValue({
        plan: sharedPlanWithReviewPlaceholder,
        planReady: false,
        reviewContent: {},
      });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: false,
        progress: null,
        plan: null,
        refreshAvailable: false,
        planReady: false,
        reviewContent: {},
      });

      renderPlanPage();

      expect(await screen.findByText('Your plan is being finalized')).toBeInTheDocument();
      expect(screen.getByText('Weekly check-in content is still generating. Please check back within 24 hours.')).toBeInTheDocument();
      expect(screen.queryByText('Shared Resource 7')).not.toBeInTheDocument();
    });

    it('opens review content in a modal with recall inputs instead of rendering below the grid', async () => {
      const sharedPlanWithReadyReview = SHARED_PLAN.map((day) =>
        day.day_number === 7
          ? {
              ...day,
              content_id: null,
              content_type: 'review',
              review_status: 'ready',
              review_title: 'Week 1 review',
              review_body: JSON.stringify({
                summary: 'Quick recap before you move on.',
                content_covered: [
                  { day: 1, type: 'video', title: 'Intro to Python' },
                ],
                knowledge_checks: [
                  {
                    id: 'k1',
                    question: 'What is a variable and when would you use one?',
                    helper_text: 'Answer in your own words.',
                    expected_points: ['Stores a value', 'Lets you reuse/update data'],
                    placeholder: 'Explain it like you actually learned it',
                  },
                ],
                reflection_prompts: ['What still feels fuzzy after this week?'],
              }),
            }
          : day
      );

      mockGetLearningPlan.mockResolvedValue({
        plan: sharedPlanWithReadyReview,
        planReady: true,
        reviewContent: {
          7: {
            title: 'Week 1 review',
            body: {
              summary: 'Quick recap before you move on.',
              content_covered: [{ day: 1, type: 'video', title: 'Intro to Python' }],
              knowledge_checks: [
                {
                  id: 'k1',
                  question: 'What is a variable and when would you use one?',
                  helper_text: 'Answer in your own words.',
                  expected_points: ['Stores a value', 'Lets you reuse/update data'],
                  placeholder: 'Explain it like you actually learned it',
                },
              ],
              reflection_prompts: ['What still feels fuzzy after this week?'],
            },
          },
        },
      });
      mockGetPlanProgress.mockResolvedValue({
        enrolled: false,
        progress: null,
        plan: null,
        refreshAvailable: false,
        planReady: true,
        reviewContent: {},
      });

      renderPlanPage();

      const user = userEvent.setup();
      const openButton = await screen.findByRole('button', { name: /week 1 review/i });
      await user.click(openButton);

      expect(await screen.findByRole('dialog', { name: /day 7 review/i })).toBeInTheDocument();
      expect(screen.getByText('Start review')).toBeInTheDocument();
      expect(screen.queryByText('Open review')).toBeInTheDocument();

      await user.click(screen.getByText('Start review'));
      expect(await screen.findByText('What is a variable and when would you use one?')).toBeInTheDocument();
      expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
      expect(screen.getByText('Stores a value')).toBeInTheDocument();
    });
  });

  describe('auth loading race condition', () => {
    it('waits for auth before fetching plan data', async () => {
      // Auth still loading
      mockUseAuth.mockReturnValue({ user: null, loading: true });

      renderPlanPage();

      // Should not have fetched anything yet
      expect(mockGetLearningPlan).not.toHaveBeenCalled();
      expect(mockGetPlanProgress).not.toHaveBeenCalled();
    });
  });
});
