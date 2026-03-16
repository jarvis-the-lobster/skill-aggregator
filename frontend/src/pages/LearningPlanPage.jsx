import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Play, BookOpen, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { RatingButtons } from '../components/RatingButtons';

const FREE_DAYS = 7;

export function LearningPlanPage() {
  const { skillId } = useParams();
  const { user } = useAuth();
  const [plan, setPlan] = useState([]);
  const [skillName, setSkillName] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [completedDays, setCompletedDays] = useState(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [ratings, setRatings] = useState({ counts: {}, userRatings: {} });

  useEffect(() => {
    loadPlan();
  }, [skillId]);

  const loadPlan = async () => {
    setLoading(true);
    try {
      const fetches = [
        apiService.getLearningPlan(skillId),
        apiService.getSkillContent(skillId),
      ];
      if (user) fetches.push(apiService.getPlanProgress(skillId).catch(() => null));
      const [planData, skillData, progressData] = await Promise.all(fetches);

      // Fetch ratings in parallel with nothing — we have the IDs now, before any setState
      const ids = (planData.plan || []).map(e => e.content_id).filter(Boolean);
      const ratingsData = ids.length
        ? await apiService.getRatings(ids).catch(() => ({ counts: {}, userRatings: {} }))
        : { counts: {}, userRatings: {} };

      // Set all state together so RatingButtons mounts with correct initial props
      setPlan(planData.plan || []);
      setSkillName(skillData.skill?.name || skillId);
      setRatings(ratingsData);

      if (progressData?.enrolled) {
        setEnrolled(true);
        const days = JSON.parse(progressData.progress?.completed_days || '[]');
        setCompletedDays(new Set(days));
      }
    } catch (error) {
      console.error('Error loading learning plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await apiService.enrollLearningPlan(skillId);
      setEnrolled(true);
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
    } catch (err) {
      console.error('Complete day error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[...Array(30)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>{`30-Day ${skillName} Learning Plan | SkillAggregator`}</title>
        <meta name="description" content={`A structured 30-day day-by-day learning plan for ${skillName}. Follow a curated sequence of videos and articles.`} />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to={`/skills/${skillId}`}
          className="inline-flex items-center text-primary-600 hover:text-primary-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {skillName}
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          30-Day {skillName} Learning Plan
        </h1>
        <p className="text-gray-600 mb-4">
          A structured day-by-day roadmap through the best curated content.
          {!user && (
            <span className="ml-1">
              Days 1–7 are free.{' '}
              <Link to="/signup" className="text-primary-600 underline">
                Sign up
              </Link>{' '}
              to unlock all 30 days.
            </span>
          )}
        </p>


        {plan.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-900 mb-2">No plan generated yet</h2>
            <p className="text-gray-500">
              A learning plan will be available once content has been scraped for this skill.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {(enrolled ? plan : plan.slice(0, FREE_DAYS)).map((entry) => {
              const unlocked = entry.day_number <= FREE_DAYS || enrolled;
              const hasContent = Boolean(entry.content_id);
              const isCompleted = completedDays.has(entry.day_number);

              return (
                <div
                  key={entry.day_number}
                  className={`relative rounded-lg border p-3 flex flex-col min-h-[8rem] ${
                    isCompleted
                      ? 'bg-green-50 border-green-400'
                      : unlocked
                      ? 'bg-white border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-semibold ${
                        isCompleted ? 'text-green-600' : unlocked ? 'text-primary-600' : 'text-gray-400'
                      }`}
                    >
                      Day {entry.day_number}
                    </span>
                    {isCompleted ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : !unlocked ? (
                      <Lock className="w-3 h-3 text-gray-300" />
                    ) : null}
                  </div>

                  {unlocked && hasContent ? (
                    <>
                      <div className="flex items-center space-x-1 mb-1">
                        {entry.content_type === 'video' ? (
                          <Play className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        ) : (
                          <BookOpen className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        )}
                        <span
                          className={`text-xs ${
                            entry.content_type === 'video' ? 'text-purple-600' : 'text-blue-600'
                          }`}
                        >
                          {entry.content_type}
                        </span>
                      </div>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-800 hover:text-primary-600 line-clamp-3 flex-grow"
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
                          className="mt-2 text-xs text-green-600 hover:text-green-700 text-left"
                        >
                          Mark complete
                        </button>
                      )}
                    </>
                  ) : unlocked && !hasContent ? (
                    <p className="text-xs text-gray-400 flex-grow flex items-center">
                      No content assigned
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center flex-grow py-2">
                      <Lock className="w-5 h-5 text-gray-300 mb-1" />
                      <p className="text-xs text-gray-400 text-center">Upgrade to unlock</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!enrolled && plan.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 text-center border border-purple-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Unlock the full 30-day plan
            </h2>
            <p className="text-gray-600 mb-4">
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
