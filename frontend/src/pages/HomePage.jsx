import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Play, BookOpen, Clock, TrendingUp } from 'lucide-react';
import { apiService } from '../services/api';

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const data = await apiService.getSkills();
      setSkills(data.skills);
    } catch (error) {
      console.error('Error loading skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // For MVP, redirect to first matching skill
      const matchingSkill = skills.find(skill => 
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.id.includes(searchQuery.toLowerCase())
      );
      
      if (matchingSkill) {
        window.location.href = `/skill/${matchingSkill.id}`;
      }
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="search-container text-white py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Learn Any Skill,
            <span className="block text-yellow-300">Faster Than Ever</span>
          </h1>
          
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Stop wasting time searching. Get curated learning content 
            for any skill in seconds.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
            <div className="flex items-center bg-white rounded-full p-2 shadow-lg">
              <input
                type="text"
                placeholder="What do you want to learn? (e.g., Python, Marketing, Design)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-grow px-6 py-3 text-gray-700 text-lg rounded-full focus:outline-none"
              />
              <button 
                type="submit"
                className="bg-primary-500 hover:bg-primary-600 text-white p-3 rounded-full transition-colors"
              >
                <Search className="w-6 h-6" />
              </button>
            </div>
          </form>

          {/* Quick Stats */}
          <div className="flex justify-center space-x-8 text-sm opacity-80">
            <div className="flex items-center space-x-1">
              <Play className="w-4 h-4" />
              <span>1000+ Videos</span>
            </div>
            <div className="flex items-center space-x-1">
              <BookOpen className="w-4 h-4" />
              <span>500+ Articles</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>Save 10+ Hours</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Skills */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Popular Skills to Master
            </h2>
            <p className="text-xl text-gray-600">
              Start with these high-demand skills
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skill-card animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-4"></div>
                  <div className="h-3 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((skill) => (
                <Link 
                  key={skill.id}
                  to={`/skill/${skill.id}`}
                  className="skill-card group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                      {skill.name}
                    </h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      skill.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
                      skill.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {skill.difficulty}
                    </span>
                  </div>
                  
                  <p className="text-gray-600 mb-4">
                    {skill.description}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>~{skill.estimatedHours}h</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="capitalize">{skill.category}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              From search to mastery in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Search Your Skill',
                description: 'Tell us what you want to learn - from coding to cooking, we have you covered.'
              },
              {
                step: '2', 
                title: 'Get Curated Content',
                description: 'Receive the best videos, articles, and tutorials, organized by difficulty and quality.'
              },
              {
                step: '3',
                title: 'Start Learning',
                description: 'Follow our structured path and track your progress as you master new skills.'
              }
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-primary-500 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}