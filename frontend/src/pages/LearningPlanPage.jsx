import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Play, BookOpen, Lock, ArrowLeft, CheckCircle, ClipboardCheck, Loader } from 'lucide-react';
import { ReviewCheckInPanel } from '../components/ReviewCheckInPanel';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { RatingButtons } from '../components/RatingButtons';
import analytics from '../services/analytics';
import { STREAK_REFRESH_EVENT } from '../hooks/useStreak';

const FREE_DAYS = 7;

// Format seconds as "M:SS" for display (e.g. "25:00")
function formatTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Build a YouTube URL with timestamp if applicable
function getEntryUrl(entry) {
  if (!entry.url) return null;
  if (entry.timestamp_start_seconds > 0 && entry.source === 'YouTube') {
    const sep = entry.url.includes('?') ? '&' : '?';
    return `${entry.url}${sep}t=${entry.timestamp_start_seconds}s`;
  }
  return entry.url;
}

export function LearningPlanPage() {
  const { skillId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [plan, setPlan] = useState([]);
  const [skillName, setSkillName] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [completedDays, setCompletedDays] = useState(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [premiumPending, setPremiumPending] = useState(false);
  const [premiumDayCount, setPremiumDayCount] = useState(0);
  const [mergingPremium, setMergingPremium] = useState(false);
  const [ratings, setRatings] = useState({ counts: {}, userRatings: {} });
  const [planReady, setPlanReady] = useState(true);
  const [reviewContent, setReviewContent] = useState({});
  const [expandedReview, setExpandedReview] = useState(null);
  const reviewButtonRefs = useRef({});
  const resolvedReviewByDay = useMemo(() => {
    const map = { ...reviewContent };
    for (const entry of plan) {
      if (entry.content_type !== 'review') continue;
      map[entry.day_number] = {
        day_number: entry.day_number,
        title: entry.review_title,
        body: typeof entry.review_body === 'string'
          ? (() => { try { return JSON.parse(entry.review_body); } catch { return entry.review_body; } })()
          : entry.review_body,
        review_type: 'weekly_checkin',
      };
    }
    return map;
  }, [plan, reviewContent]);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const fetches = [
        apiService.getLearningPlan(skillId),
        apiService.getSkillContent(skillId),
      ];
      if (user) fetches.push(apiService.getPlanProgress(skillId).catch(() => null));
      const [planData, skillData, progressData] = await Promise.all(fetches);

      const hasPersonalPlan = Boolean(progressData?.enrolled && Array.isArray(progressData?.plan));

      // Rendering source of truth:
      // - enrolled users render only their personal plan
      // - everyone else renders the shared plan
      const displayPlan = hasPersonalPlan ? progressData.plan : (planData.plan || []);

      // Review metadata must match the rendered plan source. Shared review state should never
      // hijack a rendered personal plan unless the personal plan itself contains review entries.
      const selectedReviewContent = hasPersonalPlan
        ? (progressData?.reviewContent ?? {})
        : (planData.reviewContent ?? {});
      const renderedReviewDaySet = new Set(
        displayPlan
          .filter((entry) => entry.content_type === 'review')
          .map((entry) => entry.day_number)
      );
      const filteredReviewContent = Object.fromEntries(
        Object.entries(selectedReviewContent).filter(([day]) => renderedReviewDaySet.has(Number(day)))
      );
      const hasPendingRenderedReviewDays = displayPlan.some((entry) => entry.content_type === 'review' && !filteredReviewContent[entry.day_number]);
      const shouldShowPlanFinalizingState = hasPendingRenderedReviewDays && !hasPersonalPlan;

      setPlanReady(shouldShowPlanFinalizingState ? (planData.planReady ?? true) : true);
      setReviewContent(filteredReviewContent);

      // Fetch ratings in parallel with nothing — we have the IDs now, before any setState
      const ids = displayPlan.map(e => e.content_id).filter(Boolean);
      const ratingsData = ids.length
        ? await apiService.getRatings(ids).catch(() => ({ counts: {}, userRatings: {} }))
        : { counts: {}, userRatings: {} };

      // Set all state together so RatingButtons mounts with correct initial props
      setPlan(displayPlan);
      setSkillName(skillData.skill?.name || skillId);
      setRatings(ratingsData);

      const isEnrolled = Boolean(progressData?.enrolled);
      setEnrolled(isEnrolled);

      if (isEnrolled) {
        const days = JSON.parse(progressData.progress?.completed_days || '[]');
        setCompletedDays(new Set(days));
        setRefreshAvailable(progressData.refreshAvailable || false);

        if (!isPremium) {
          setPremiumPending(false);
          setPremiumDayCount(0);
        }
      } else {
        setCompletedDays(new Set());
        setRefreshAvailable(false);
        setPremiumPending(false);
        setPremiumDayCount(0);
      }

      analytics.learningPlanViewed(skillId, {
        enrolled: isEnrolled,
        is_premium: isPremium,
        plan_length: displayPlan.length,
        skill_name: skillData.skill?.name || skillId,
      });
    } catch (error) {
      console.error('Error loading learning plan:', error);
    } finally {
      setLoading(false);
    }
  }, [skillId, user, isPremium]);

  useEffect(() => {
    // Wait for auth to resolve before loading, otherwise user is null
    // on hard refresh and we skip the personal plan fetch
    if (authLoading) return;
    loadPlan();
  }, [skillId, authLoading, loadPlan]);

  useEffect(() => {
    if (authLoading || subscriptionLoading || !user || !enrolled || !isPremium) return;

    let cancelled = false;
    apiService.getPremiumPending(skillId)
      .then((premiumData) => {
        if (cancelled) return;
        setPremiumPending(Boolean(premiumData.hasPending));
        setPremiumDayCount(premiumData.dayCount || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setPremiumPending(false);
        setPremiumDayCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [skillId, user, enrolled, isPremium, authLoading, subscriptionLoading]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await apiService.enrollLearningPlan(skillId);
      setEnrolled(true);
      analytics.learningPlanEnrolled(skillId, { skill_name: skillName });
    } catch (err) {
      console.error('Enroll error:', err);
    } finally {
      setEnrolling(false);
    }
  };

  const handleCompleteDay = async (day) => {
    try {
      const data = await apiService.completePlanDay(skillId, day);
      const days = JSON.parse(data.progress?.completed_days || '[]');
      setCompletedDays(new Set(days));
      window.dispatchEvent(new CustomEvent(STREAK_REFRESH_EVENT));
      analytics.track('plan_day_completed', { skillId, day, totalCompleted: days.length });
    } catch (err) {
      console.error('Complete day error:', err);
    }
  };

  const handleMergePremium = async () => {
    setMergingPremium(true);
    try {
      const data = await apiService.mergePremiumPlan(skillId);
      if (data.merged && data.plan) {
        setPlan(data.plan);
        setPremiumPending(false);
        setPremiumDayCount(0);
        analytics.premiumPlanMerged(skillId, { day_count: data.plan.length });
        const ids = data.plan.map(e => e.content_id).filter(Boolean);
        if (ids.length) {
          const ratingsData = await apiService.getRatings(ids).catch(() => ({ counts: {}, userRatings: {} }));
          setRatings(ratingsData);
        }
      }
    } catch (err) {
      console.error('Premium merge error:', err);
    } finally {
      setMergingPremium(false);
    }
  };

  const handleRefreshPlan = async () => {
    setRefreshing(true);
    try {
      const data = await apiService.refreshPlan(skillId);
      if (data.refreshed && data.plan) {
        setPlan(data.plan);
        setRefreshAvailable(false);
        analytics.learningPlanRefreshed(skillId, { plan_length: data.plan.length });

        const nextReviewContent = data.reviewContent || {};
        const renderedReviewDaySet = new Set(
          data.plan
            .filter((entry) => entry.content_type === 'review')
            .map((entry) => entry.day_number)
        );
        const filteredReviewContent = Object.fromEntries(
          Object.entries(nextReviewContent).filter(([day]) => renderedReviewDaySet.has(Number(day)))
        );
        const hasPendingRenderedReviewDays = data.plan.some(
          (entry) => entry.content_type === 'review' && !filteredReviewContent[entry.day_number]
        );
        const shouldShowPlanFinalizingState = hasPendingRenderedReviewDays && !enrolled;

        setReviewContent(filteredReviewContent);
        setPlanReady(shouldShowPlanFinalizingState ? (data.planReady ?? true) : true);

        // Re-fetch ratings for any new content IDs
        const ids = data.plan.map(e => e.content_id).filter(Boolean);
        if (ids.length) {
          const ratingsData = await apiService.getRatings(ids).catch(() => ({ counts: {}, userRatings: {} }));
          setRatings(ratingsData);
        }
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg p-8">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-6 bg-dark-surface rounded w-1/4 mb-6"></div>
          <div className="h-8 bg-dark-surface rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-dark-surface rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[...Array(30)].map((_, i) => (
              <div key={i} className="h-32 bg-dark-surface rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Helmet>
        <title>{`30-Day ${skillName} Learning Plan | LearnStack`}</title>
        <meta name="description" content={`A structured 30-day day-by-day learning plan for ${skillName}. Follow a curated sequence of videos and articles.`} />
        <meta property="og:title" content={`30-Day ${skillName} Learning Plan | LearnStack`} />
        <meta property="og:description" content={`A structured 30-day day-by-day learning plan for ${skillName}. Follow a curated sequence of videos and articles.`} />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/skills/${skillId}/plan`} />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to={`/skills/${skillId}`}
          className="inline-flex items-center text-teal hover:text-teal-light mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {skillName}
        </Link>

        <h1 className="text-3xl font-bold text-slate-100 mb-2">
          30-Day {skillName} Learning Plan
        </h1>
        <p className="text-slate-400 mb-4">
          A structured day-by-day roadmap through the best curated content.
          {!user && (
            <span className="ml-1">
              Days 1–7 are free.{' '}
              <Link to="/signup" className="text-teal underline">
                Sign up
              </Link>{' '}
              to unlock all 30 days.
            </span>
          )}
        </p>


        {!planReady && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
            <Loader className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">Your plan is being finalized</p>
              <p className="text-xs text-amber-400/70">Weekly check-in content is still generating. Please check back within 24 hours.</p>
            </div>
          </div>
        )}

        {premiumPending && enrolled && (
          <div className="mb-6 bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-300">✨ Your personalized plan is ready</p>
              <p className="text-xs text-purple-400/70">{premiumDayCount} days hand-picked based on your review responses.</p>
            </div>
            <button
              onClick={handleMergePremium}
              disabled={mergingPremium}
              className="ml-4 px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-400 disabled:opacity-50 whitespace-nowrap font-semibold"
            >
              {mergingPremium ? 'Applying…' : 'Apply Now'}
            </button>
          </div>
        )}

        {refreshAvailable && enrolled && !premiumPending && !(isPremium && plan.some(d => d.day_number > 7 && d.content_type !== 'review')) && (
          <div className="mb-6 bg-teal/10 border border-teal/20 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-teal-light">New resources available!</p>
              <p className="text-xs text-teal/70">We found better content for your incomplete days. Your completed days won't change.</p>
            </div>
            <button
              onClick={handleRefreshPlan}
              disabled={refreshing}
              className="ml-4 px-4 py-2 bg-teal text-dark-bg text-sm rounded-lg hover:bg-teal-light disabled:opacity-50 whitespace-nowrap font-semibold"
            >
              {refreshing ? 'Updating…' : 'Update Plan'}
            </button>
          </div>
        )}

        {plan.length === 0 ? (
          <div className="text-center py-16 bg-dark-card rounded-xl border border-white/[0.08]">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-slate-100 mb-2">No plan generated yet</h2>
            <p className="text-slate-400">
              A learning plan will be available once content has been scraped for this skill.
            </p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {(enrolled ? plan : plan.slice(0, FREE_DAYS)).map((entry) => {
              const unlocked = entry.day_number <= FREE_DAYS || enrolled;
              const hasContent = Boolean(entry.content_id);
              const isCompleted = completedDays.has(entry.day_number);
              const inlineReview = entry.content_type === 'review'
                ? {
                    day_number: entry.day_number,
                    title: entry.review_title,
                    body: typeof entry.review_body === 'string'
                      ? (() => { try { return JSON.parse(entry.review_body); } catch { return entry.review_body; } })()
                      : entry.review_body,
                    review_type: 'weekly_checkin',
                  }
                : null;
              const isReviewDay = Boolean(inlineReview);
              const review = inlineReview || resolvedReviewByDay[entry.day_number];
              const shouldRenderReviewCard = isReviewDay;

              return (
                <div
                  key={entry.day_number}
                  className={`relative rounded-lg border p-3 flex flex-col min-h-[8rem] ${
                    isCompleted
                      ? 'bg-green-500/10 border-green-500/30'
                      : shouldRenderReviewCard && unlocked
                      ? 'bg-purple-500/10 border-purple-500/20 hover:border-purple-400/40 hover:shadow-sm transition-all'
                      : unlocked
                      ? 'bg-dark-card border-white/[0.08] hover:border-teal/30 hover:shadow-sm transition-all'
                      : 'bg-dark-surface/50 border-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-semibold ${
                        isCompleted ? 'text-sky-400' : shouldRenderReviewCard && unlocked ? 'text-purple-400' : unlocked ? 'text-sky-400' : 'text-slate-500'
                      }`}
                    >
                      Day {entry.day_number}
                      {shouldRenderReviewCard && unlocked && <span className="ml-1 text-purple-400/70">· Check-in</span>}
                    </span>
                    {isCompleted ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : !unlocked ? (
                      <Lock className="w-3 h-3 text-slate-600" />
                    ) : null}
                  </div>

                  {shouldRenderReviewCard && unlocked && review ? (
                    <div className="flex flex-col flex-grow">
                      <div className="flex items-center space-x-1 mb-1">
                        <ClipboardCheck className="w-3 h-3 text-purple-400 flex-shrink-0" />
                        <span className="text-xs text-purple-400">review</span>
                      </div>
                      <button
                        ref={(node) => {
                          if (node) reviewButtonRefs.current[entry.day_number] = node;
                          else delete reviewButtonRefs.current[entry.day_number];
                        }}
                        onClick={() => {
                          analytics.reviewOpened(skillId, entry.day_number);
                          setExpandedReview(entry.day_number);
                        }}
                        className="flex-grow rounded-xl border border-purple-400/20 bg-purple-400/8 px-3 py-3 text-left text-sm font-medium text-slate-100 transition hover:border-purple-400/40 hover:bg-purple-400/12 hover:text-white"
                      >
                        <span className="block line-clamp-2">{review.title || 'Weekly Review'}</span>
                        <span className="mt-2 block text-xs font-normal text-purple-200/70">
                          Open review
                        </span>
                      </button>
                      {review.body?.stats && (
                        <p className="text-xs text-purple-400/60 mt-2">
                          {review.body.stats.videos > 0 && `${review.body.stats.videos} videos`}
                          {review.body.stats.videos > 0 && review.body.stats.articles > 0 && ', '}
                          {review.body.stats.articles > 0 && `${review.body.stats.articles} articles`}
                        </p>
                      )}
                      {enrolled && !isCompleted && (
                        <button
                          onClick={() => handleCompleteDay(entry.day_number)}
                          className="mt-2 text-xs text-green-400 hover:text-green-300 text-left"
                        >
                          Mark complete
                        </button>
                      )}
                    </div>
                  ) : shouldRenderReviewCard && unlocked && !review && !planReady ? (
                    <div className="flex flex-col flex-grow">
                      <div className="flex items-center space-x-1 mb-1">
                        <Loader className="w-3 h-3 text-purple-400/50 animate-spin flex-shrink-0" />
                        <span className="text-xs text-purple-400/50">check-in</span>
                      </div>
                      <p className="text-xs text-slate-500 flex-grow">
                        Generating review content. Check back within 24 hours.
                      </p>
                    </div>
                  ) : shouldRenderReviewCard && unlocked && !review ? (
                    <div className="flex flex-col flex-grow">
                      <div className="flex items-center space-x-1 mb-1">
                        <ClipboardCheck className="w-3 h-3 text-purple-400/50 flex-shrink-0" />
                        <span className="text-xs text-purple-400/50">check-in</span>
                      </div>
                      <p className="text-xs text-slate-500 flex-grow">
                        Review content will appear here once it&apos;s ready.
                      </p>
                    </div>
                  ) : unlocked && hasContent ? (
                    <>
                      <div className="flex items-center space-x-1 mb-1">
                        {entry.content_type === 'video' ? (
                          <Play className="w-3 h-3 text-teal flex-shrink-0" />
                        ) : (
                          <BookOpen className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${entry.content_type === 'video' ? 'text-teal' : 'text-blue-400'}`}>
                          {entry.content_type}
                        </span>
                      </div>
                      {entry.timestamp_start_seconds > 0 && (
                        <span className="text-xs text-amber-400 font-medium mb-0.5">
                          Continue at {formatTimestamp(entry.timestamp_start_seconds)}
                        </span>
                      )}
                      <a
                        href={getEntryUrl(entry)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-slate-200 hover:text-teal line-clamp-3 flex-grow"
                        title={entry.title}
                      >
                        {entry.title || 'Untitled'}
                      </a>
                      <RatingButtons
                        contentId={entry.content_id}
                        skillId={skillId}
                        initialCounts={ratings.counts[entry.content_id]}
                        initialUserRating={ratings.userRatings[entry.content_id]}
                      />
                      {enrolled && !isCompleted && (
                        <button
                          onClick={() => handleCompleteDay(entry.day_number)}
                          className="mt-2 text-xs text-green-400 hover:text-green-300 text-left"
                        >
                          Mark complete
                        </button>
                      )}
                    </>
                  ) : unlocked && !hasContent ? (
                    <div className="flex flex-col flex-grow">
                      <p className="text-xs text-slate-500 flex-grow flex items-center">
                        Review & practice day
                      </p>
                      {enrolled && !isCompleted && (
                        <button
                          onClick={() => handleCompleteDay(entry.day_number)}
                          className="mt-2 text-xs text-green-400 hover:text-green-300 text-left"
                        >
                          Mark complete
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center flex-grow py-2">
                      <Lock className="w-5 h-5 text-slate-600 mb-1" />
                      <p className="text-xs text-slate-500 text-center">Upgrade to unlock</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {expandedReview && resolvedReviewByDay[expandedReview]?.body && (
            <ReviewCheckInPanel
              review={resolvedReviewByDay[expandedReview]}
              dayNumber={expandedReview}
              skillId={skillId}
              enrolled={enrolled}
              onSubmitted={() => {
                analytics.reviewSubmitted(skillId, expandedReview);
                handleCompleteDay(expandedReview);
              }}
              onClose={() => {
                const trigger = reviewButtonRefs.current[expandedReview];
                setExpandedReview(null);
                trigger?.focus?.();
              }}
            />
          )}

          </>
        )}

        {!enrolled && plan.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-teal/10 to-teal-deep/10 rounded-xl p-6 text-center border border-teal/20">
            <h2 className="text-xl font-bold text-slate-100 mb-2">
              Unlock the full 30-day plan
            </h2>
            <p className="text-slate-400 mb-4">
              {user
                ? 'Enroll to unlock all 30 days and track your progress.'
                : 'Create a free account to access all 30 days of curated content.'}
            </p>
            {user ? (
              <button onClick={handleEnroll} disabled={enrolling} className="btn-primary">
                {enrolling ? 'Enrolling…' : 'Enroll Free'}
              </button>
            ) : (
              <Link to="/signup" className="btn-primary">
                Get Started Free
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
