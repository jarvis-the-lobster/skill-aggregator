import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Play, BookOpen, Clock, Eye, Star, ArrowLeft, ExternalLink } from 'lucide-react';
import { apiService } from '../services/api';
import analytics from '../services/analytics';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

export function SkillPage() {
  const { id: skillId } = useParams();
  const [skillData, setSkillData] = useState(null);
  const [content, setContent] = useState({ videos: [], articles: [] });
  const [status, setStatus] = useState('loading'); // 'loading' | 'scraping' | 'ready' | 'error' | 'timeout'
  const [activeTab, setActiveTab] = useState('videos');

  const pollTimer = useRef(null);
  const timeoutTimer = useRef(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    analytics.track('content_tab_switched', { skillId, tab });
  };

  useEffect(() => {
    loadSkillData();
    return () => clearTimers();
  }, [skillId]);

  const clearTimers = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
  };

  const loadSkillData = async () => {
    clearTimers();
    setStatus('loading');
    try {
      const result = await apiService.getSkillContent(skillId);
      applyResult(result);

      if (result.status === 'scraping' || result.status === 'pending') {
        startPolling();
      }
    } catch (error) {
      console.error('Error loading skill data:', error);
      setStatus('error');
    }
  };

  const applyResult = (result) => {
    setSkillData(result.skill || null);
    if (result.content) {
      setContent(result.content);
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
        applyResult(result);

        if (result.status === 'ready' || result.status === 'error') {
          clearTimers();
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleScrapeContent = async () => {
    try {
      await apiService.scrapeSkillContent(skillId);
      clearTimers();
      setStatus('scraping');
      setContent({ videos: [], articles: [] });
      startPolling();
    } catch (error) {
      console.error('Error triggering scrape:', error);
    }
  };

  // --- Loading skeleton ---
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Scraping in progress ---
  if (status === 'scraping' || status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-6 animate-bounce">🔍</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Gathering the best resources for{' '}
            <span className="text-purple-600">{skillData?.name || skillId}</span>…
          </h1>
          <p className="text-gray-500 mb-6">
            We&apos;re scraping YouTube and top articles. This usually takes 15–30 seconds.
          </p>
          <div className="flex justify-center space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 bg-purple-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-6">Checking every 3 seconds…</p>
        </div>
      </div>
    );
  }

  // --- Timeout ---
  if (status === 'timeout') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-5xl mb-4">⏱️</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Taking longer than expected</h1>
          <p className="text-gray-500 mb-6">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Could not load skill</h1>
          <Link to="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // --- Ready state ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/"
            className="inline-flex items-center text-primary-600 hover:text-primary-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Skills
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{skillData.name}</h1>
              <p className="text-xl text-gray-600 mb-4">{skillData.description}</p>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span
                  className={`px-3 py-1 rounded-full ${
                    skillData.difficulty === 'beginner'
                      ? 'bg-green-100 text-green-800'
                      : skillData.difficulty === 'intermediate'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {skillData.difficulty}
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

            <button onClick={handleScrapeContent} className="btn-primary">
              Refresh Content
            </button>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border">
          {/* Tab Headers */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => handleTabChange('videos')}
                className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'videos'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Articles ({content.articles?.length || 0})</span>
                </div>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'videos' && (
              <div className="space-y-6">
                {content.videos?.length > 0 ? (
                  content.videos.map((video) => (
                    <div key={video.id} className="content-card">
                      <div className="flex space-x-4">
                        <img
                          src={video.thumbnail || 'https://via.placeholder.com/320x180'}
                          alt={video.title}
                          className="w-32 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                        <div className="flex-grow">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {video.title}
                          </h3>
                          <p className="text-gray-600 text-sm mb-3">{video.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span>{video.channel || video.source}</span>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>{video.duration}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Eye className="w-3 h-3" />
                                <span>{video.views}</span>
                              </div>
                              {video.rating && (
                                <div className="flex items-center space-x-1">
                                  <Star className="w-3 h-3" />
                                  <span>{video.rating}/5</span>
                                </div>
                              )}
                            </div>
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-primary flex items-center space-x-2"
                            >
                              <Play className="w-4 h-4" />
                              <span>Watch</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <Play className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No videos yet</h3>
                    <p className="text-gray-500 mb-4">
                      Content is being gathered. Try refreshing in a few minutes.
                    </p>
                    <button onClick={handleScrapeContent} className="btn-primary">
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
                    <div key={article.id} className="content-card">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {article.title}
                      </h3>
                      <p className="text-gray-600 mb-4">{article.excerpt || article.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
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
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary flex items-center space-x-2"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>Read</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No articles yet</h3>
                    <p className="text-gray-500 mb-4">
                      Content is being gathered. Try refreshing in a few minutes.
                    </p>
                    <button onClick={handleScrapeContent} className="btn-primary">
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
