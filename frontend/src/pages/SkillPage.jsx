import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Play, BookOpen, Clock, Eye, Star, ArrowLeft, ExternalLink } from 'lucide-react';
import { apiService } from '../services/api';

export function SkillPage() {
  const { id: skillId } = useParams();
  const [skillData, setSkillData] = useState(null);
  const [content, setContent] = useState({ videos: [], articles: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('videos');

  useEffect(() => {
    loadSkillData();
  }, [skillId]);

  const loadSkillData = async () => {
    try {
      setLoading(true);
      
      // Load skill info and content
      const [skillsResponse, contentResponse] = await Promise.all([
        apiService.getSkills(),
        apiService.getSkillContent(skillId)
      ]);
      
      const skill = skillsResponse.skills.find(s => s.id === skillId);
      setSkillData(skill);
      setContent(contentResponse.content);
    } catch (error) {
      console.error('Error loading skill data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeContent = async () => {
    try {
      await apiService.scrapeSkillContent(skillId);
      // Reload content after scraping
      setTimeout(() => {
        loadSkillData();
      }, 2000);
    } catch (error) {
      console.error('Error scraping content:', error);
    }
  };

  if (loading) {
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

  if (!skillData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Skill Not Found</h1>
          <Link to="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {skillData.name}
              </h1>
              <p className="text-xl text-gray-600 mb-4">
                {skillData.description}
              </p>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span className={`px-3 py-1 rounded-full ${
                  skillData.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
                  skillData.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {skillData.difficulty}
                </span>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>~{skillData.estimatedHours} hours</span>
                </div>
                <span className="capitalize">{skillData.category}</span>
              </div>
            </div>
            
            <button 
              onClick={handleScrapeContent}
              className="btn-primary"
            >
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
                onClick={() => setActiveTab('videos')}
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
                onClick={() => setActiveTab('articles')}
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
                          <p className="text-gray-600 text-sm mb-3">
                            {video.description}
                          </p>
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
                      {content.message || 'Content is being gathered. Try refreshing in a few minutes.'}
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
                      <p className="text-gray-600 mb-4">
                        {article.excerpt || article.description}
                      </p>
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
                      {content.message || 'Content is being gathered. Try refreshing in a few minutes.'}
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