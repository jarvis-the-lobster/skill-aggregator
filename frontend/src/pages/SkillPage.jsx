import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Play, BookOpen, Clock, Eye, Star, ArrowLeft, ExternalLink, CalendarDays } from 'lucide-react';
import { apiService } from '../services/api';
import analytics from '../services/analytics';
import { useAuth } from '../contexts/AuthContext';
import { useEnrollment } from '../hooks/useCourses';
import { RatingButtons } from '../components/RatingButtons';
import { useInitialData } from '../contexts/InitialDataContext';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

function formatViews(num) {
  if (!num && num !== 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return num.toLocaleString();
}

export function SkillPage() {
  const { id: skillId } = useParams();
  const { user } = useAuth();
  const { isEnrolled, loading: enrollLoading, enroll, unenroll } = useEnrollment(skillId);
  const initialData = useInitialData();

  // Check if we have SSR-injected data for this skill
  const ssrData = initialData?.skillId === skillId ? initialData : null;

  const [skillData, setSkillData] = useState(ssrData?.skill || null);
  const [content, setContent] = useState(ssrData?.content || { videos: [], articles: [] });
  const [status, setStatus] = useState(ssrData ? (ssrData.status || 'ready') : 'loading');
  const [activeTab, setActiveTab] = useState('videos');
  const [ratings, setRatings] = useState({ counts: {}, userRatings: {} });
  const [lastScrapedAt, setLastScrapedAt] = useState(ssrData?.content?.lastScrapedAt || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

  const pollTimer = useRef(null);
  const timeoutTimer = useRef(null);
  const initialTabSet = useRef(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    analytics.track('content_tab_switched', { skillId, tab });
  };

  const ssrUsed = useRef(!!ssrData);

  useEffect(() => {
    if (ssrUsed.current) {
      // SSR data was used for initial render — skip the fetch, but clear the flag
      // so subsequent skillId changes (client-side navigation) will fetch normally
      ssrUsed.current = false;
      return;
    }
    loadSkillData();
    return () => clearTimers();
  }, [skillId]);

  const clearTimers = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
  };

  const fetchRatings = async (videos, articles) => {
    const ids = [
      ...(videos || []).map(v => v.id),
      ...(articles || []).map(a => a.id),
    ].filter(Boolean);
    if (!ids.length) return { counts: {}, userRatings: {} };
    try {
      return await apiService.getRatings(ids);
    } catch {
      return { counts: {}, userRatings: {} };
    }
  };

  const loadSkillData = async () => {
    clearTimers();
    setStatus('loading');
    try {
      const result = await apiService.getSkillContent(skillId);

      // If content is ready, fetch ratings in parallel before rendering
      let ratingsData = { counts: {}, userRatings: {} };
      if (result.status === 'ready' && result.content) {
        ratingsData = await fetchRatings(result.content.videos, result.content.articles);
      }

      applyResult(result, ratingsData);

      if (result.status === 'scraping' || result.status === 'pending') {
        startPolling();
      }
    } catch (error) {
      console.error('Error loading skill data:', error);
      setStatus('error');
    }
  };

  const applyResult = (result, ratingsData = null) => {
    setSkillData(result.skill || null);
    if (result.content) {
      setContent(result.content);
      if (result.content.lastScrapedAt) setLastScrapedAt(result.content.lastScrapedAt);
      // Auto-switch to articles tab if we have articles but no videos (first time only)
      if (!initialTabSet.current && result.content.articles?.length > 0 && !result.content.videos?.length) {
        setActiveTab('articles');
        initialTabSet.current = true;
      }
    }
    if (ratingsData) {
      setRatings(ratingsData);
    }
    setStatus(result.status || 'error');
  };

  const startPolling = () => {
    // Timeout after 60 seconds
    timeoutTimer.current = setTimeout(() => {
      clearTimers();
      setStatus('timeout');
    }, POLL_TIMEOUT_MS);

    pollTimer.current = setInterval(async () => {
      try {
        const result = await apiService.getSkillContent(skillId);

        let ratingsData = null;
        if (result.status === 'ready' && result.content) {
          ratingsData = await fetchRatings(result.content.videos, result.content.articles);
        }

        applyResult(result, ratingsData);

        if (result.status === 'ready' || result.status === 'error') {
          clearTimers();
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleRefreshContent = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      clearTimers();
      const prevLastScraped = lastScrapedAt;
      const [result] = await Promise.all([
        apiService.getSkillContent(skillId),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      let ratingsData = { counts: {}, userRatings: {} };
      if (result.status === 'ready' && result.content) {
        ratingsData = await fetchRatings(result.content.videos, result.content.articles);
      }
      applyResult(result, ratingsData);
      if (result.status === 'scraping' || result.status === 'pending') {
        startPolling();
        setRefreshMessage('Scraping in progress...');
        setTimeout(() => setRefreshMessage(null), 3000);
      } else if (result.content?.lastScrapedAt === prevLastScraped) {
        setRefreshMessage('already-up-to-date');
      } else {
        setRefreshMessage('Content updated!');
        setTimeout(() => setRefreshMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error refreshing content:', error);
      setRefreshMessage('Refresh failed');
      setTimeout(() => setRefreshMessage(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- Loading skeleton ---
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-dark-bg p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-dark-surface rounded w-1/3"></div>
            <div className="h-64 bg-dark-surface rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-48 bg-dark-surface rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if we have any content despite non-ready status
  const hasArticles = content.articles?.length > 0;
  const hasVideos = content.videos?.length > 0;
  const hasAnyContent = hasArticles || hasVideos;

  // --- Scraping in progress (only show if truly zero content) ---
  if ((status === 'scraping' || status === 'pending') && !hasAnyContent) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-6 animate-bounce">🔍</div>
          <h1 className="text-2xl font-bold text-slate-100 mb-3">
            Gathering the best resources for{' '}
            <span className="text-teal">{skillData?.name || skillId}</span>…
          </h1>
          <p className="text-slate-400 mb-6">
            We&apos;re scraping YouTube and top articles. This usually takes 15–30 seconds.
          </p>
          <div className="flex justify-center space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 bg-teal rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-6">Checking every 3 seconds…</p>
        </div>
      </div>
    );
  }

  // --- Timeout (only show if truly zero content) ---
  if (status === 'timeout' && !hasAnyContent) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-5xl mb-4">⏱️</p>
          <h1 className="text-2xl font-bold text-slate-100 mb-3">Taking longer than expected</h1>
          <p className="text-slate-400 mb-6">
            Content gathering is still in progress. Check back in a moment.
          </p>
          <div className="flex justify-center space-x-3">
            <button onClick={loadSkillData} className="btn-primary">
              Check Again
            </button>
            <Link to="/" className="btn-secondary">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Skill not found / error ---
  if (!skillData || status === 'error') {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100 mb-4">Could not load skill</h1>
          <Link to="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // --- Ready state ---
  return (
    <div className="min-h-screen bg-dark-bg">
      <Helmet>
        <title>{`Learn ${skillData.name} — Best Videos & Articles | LearnStack`}</title>
        <meta name="description" content={skillData.description || `Discover the best curated YouTube videos and articles to learn ${skillData.name}. Quality-ranked content so you get straight to learning.`} />
        <meta property="og:title" content={`Learn ${skillData.name} — Best Videos & Articles | LearnStack`} />
        <meta property="og:description" content={skillData.description || `Curated resources to learn ${skillData.name}.`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`Learn ${skillData.name} — Best Videos & Articles | LearnStack`} />
        <meta name="twitter:description" content={skillData.description || `Curated resources to learn ${skillData.name}.`} />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/skills/${skillData.id}`} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: skillData.name,
          description: skillData.description,
          provider: { '@type': 'Organization', name: 'LearnStack' },
          educationalLevel: skillData.difficulty,
          url: `https://learnstack.dev/skills/${skillData.id}`,
        })}</script>
      </Helmet>

      {/* Header */}
      <div className="bg-dark-card border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/"
            className="inline-flex items-center text-teal hover:text-teal-light mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Skills
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mb-2">{skillData.name}</h1>
              <p className="text-lg sm:text-xl text-slate-400 mb-4">{skillData.description}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span
                  className={`px-3 py-1 rounded-full ${
                    skillData.difficulty === 'beginner'
                      ? 'bg-green-500/15 text-green-400'
                      : skillData.difficulty === 'intermediate'
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  {skillData.difficulty?.charAt(0).toUpperCase() + skillData.difficulty?.slice(1)}
                </span>
                {skillData.estimatedHours > 0 && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>~{skillData.estimatedHours} hours</span>
                  </div>
                )}
                <span className="capitalize">{skillData.category}</span>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end space-y-2 shrink-0">
              <div className="flex items-center space-x-3">
                {!user ? (
                  <Link to="/login" className="btn-secondary text-sm">
                    Sign in to enroll
                  </Link>
                ) : isEnrolled ? (
                  <button
                    onClick={async () => {
                      if (window.confirm('Unenroll from this course?')) await unenroll();
                    }}
                    disabled={enrollLoading}
                    className="flex items-center space-x-1 px-6 py-2 rounded-lg bg-green-500/15 text-green-400 font-medium text-sm hover:bg-green-500/25 transition-colors disabled:opacity-50"
                  >
                    <span>✓ Enrolled</span>
                  </button>
                ) : (
                  <button
                    onClick={enroll}
                    disabled={enrollLoading}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    ＋ Enroll in this Course
                  </button>
                )}
                <button
                  onClick={handleRefreshContent}
                  disabled={isRefreshing || refreshMessage === 'already-up-to-date'}
                  className="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed leading-[1.25rem]"
                >
                  <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>{' '}
                  {isRefreshing ? 'Refreshing...' : refreshMessage === 'already-up-to-date' ? 'Up to date' : 'Refresh'}
                </button>
              </div>
              <span className="text-xs transition-all">
                {refreshMessage && refreshMessage !== 'already-up-to-date'
                  ? <span className="text-teal">{refreshMessage}</span>
                  : <span className="text-slate-500">{lastScrapedAt ? `Updated: ${new Date(lastScrapedAt).toLocaleDateString()}` : 'Never updated'}</span>
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-dark-card rounded-xl border border-white/[0.08]">
          {/* Tab Headers */}
          <div className="border-b border-white/[0.08]">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => handleTabChange('videos')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'videos'
                    ? 'border-teal text-teal'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Play className="w-4 h-4" />
                  <span>Videos ({content.videos?.length || 0})</span>
                </div>
              </button>

              <button
                onClick={() => handleTabChange('articles')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'articles'
                    ? 'border-teal text-teal'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Articles ({content.articles?.length || 0})</span>
                </div>
              </button>

              <Link
                to={`/skills/${skillId}/plan`}
                className="py-4 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <CalendarDays className="w-4 h-4" />
                  <span>30-Day Plan</span>
                </div>
              </Link>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'videos' && (
              <div className="space-y-6">
                {/* Banner: videos coming soon when we have articles but no videos */}
                {!content.videos?.length && content.articles?.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-teal/10 border border-teal/20 rounded-lg text-sm text-teal-light">
                    <span className="text-lg">🎬</span>
                    <p>Video content for this skill is being gathered and will be available within 24 hours. Check out the <button onClick={() => handleTabChange('articles')} className="underline font-medium hover:text-teal">articles</button> in the meantime!</p>
                  </div>
                )}
                {content.videos?.length > 0 ? (
                  content.videos.map((video) => (
                    <div key={video.id} className="content-card overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
                        <img
                          src={video.thumbnail || 'https://via.placeholder.com/320x180'}
                          alt={video.title}
                          className="w-full sm:w-32 h-44 sm:h-20 object-cover rounded-lg flex-shrink-0 mb-3 sm:mb-0"
                        />
                        <div className="min-w-0 flex-grow">
                          <h3 className="text-base sm:text-lg font-semibold text-slate-100 mb-2 break-words">
                            {video.title}
                          </h3>
                          <p className="text-slate-400 text-sm mb-3 line-clamp-2">{video.description}</p>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                              <span>{video.channel || video.source}</span>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>{video.duration}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Eye className="w-3 h-3" />
                                <span>{formatViews(video.views)} views</span>
                              </div>
                              {video.rating && (
                                <div className="flex items-center space-x-1">
                                  <Star className="w-3 h-3" />
                                  <span>{video.rating}/5</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-3">
                              <RatingButtons
                                contentId={video.id}
                                skillId={skillId}
                                initialCounts={ratings.counts[video.id]}
                                initialUserRating={ratings.userRatings[video.id]}
                              />
                              <a
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary flex items-center space-x-2"
                                onClick={() => analytics.track('content_link_clicked', { skillId, contentId: video.id, type: 'video', source: video.source })}
                              >
                                <Play className="w-4 h-4" />
                                <span>Watch</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <Play className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-100 mb-2">No videos yet</h3>
                    <p className="text-slate-400 mb-4">
                      Content is being gathered. Try refreshing in a few minutes.
                    </p>
                    <button onClick={handleRefreshContent} className="btn-primary">
                      Find Videos
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'articles' && (
              <div className="space-y-6">
                {content.articles?.length > 0 ? (
                  content.articles.map((article) => (
                    <div key={article.id} className="content-card overflow-hidden">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-100 mb-2 break-words">
                        {article.title}
                      </h3>
                      <p className="text-slate-400 mb-4 text-sm sm:text-base line-clamp-3">{article.excerpt || article.description}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                          <span>{article.source}</span>
                          <span>by {article.author}</span>
                          {article.readTime && (
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>{article.readTime}</span>
                            </div>
                          )}
                          <span>{new Date(article.publishedDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <RatingButtons
                            contentId={article.id}
                            skillId={skillId}
                            initialCounts={ratings.counts[article.id]}
                            initialUserRating={ratings.userRatings[article.id]}
                          />
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary flex items-center space-x-2"
                            onClick={() => analytics.track('content_link_clicked', { skillId, contentId: article.id, type: 'article', source: article.source })}
                          >
                            <BookOpen className="w-4 h-4" />
                            <span>Read</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-100 mb-2">No articles yet</h3>
                    <p className="text-slate-400 mb-4">
                      Content is being gathered. Try refreshing in a few minutes.
                    </p>
                    <button onClick={handleRefreshContent} className="btn-primary">
                      Find Articles
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
