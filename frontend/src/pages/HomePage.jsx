import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, BookOpen, ListChecks, ArrowRight } from 'lucide-react';
import { apiService } from '../services/api';
import { SkillCard } from '../components/SkillCard';
import { SearchBar } from '../components/SearchBar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import analytics from '../services/analytics';

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : '';

// Curated featured skills shown on the homepage (ordered by priority)
const FEATURED_SKILL_IDS = [
  // Originals
  'python', 'web-development', 'javascript', 'data-science', 'digital-marketing',
  // Opus top picks
  'machine-learning', 'sql', 'cybersecurity', 'aws', 'react-native',
  'product-management', 'personal-finance', 'copywriting', 'figma', 'blender',
  'excel', 'premiere-pro', 'deep-learning', 'devops', 'ui-ux-design',
];

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState([]);
  const [contentCounts, setContentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      setError(null);
      const data = await apiService.getSkills();
      const skillsList = data.skills || [];
      setSkills(skillsList);

      // Fetch content counts for ready skills in parallel
      const statsResults = await Promise.allSettled(
        skillsList
          .filter(s => s.status === 'ready')
          .map((s) => apiService.getSkillStats(s.id))
      );
      const readySkills = skillsList.filter(s => s.status === 'ready');
      const counts = {};
      statsResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { stats } = result.value;
          counts[readySkills[i].id] = (stats.totalVideos || 0) + (stats.totalArticles || 0);
        }
      });
      setContentCounts(counts);
    } catch (err) {
      console.error('Error loading skills:', err);
      setError('Could not load skills. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // On Enter or suggestion click: call search API then navigate
  const handleSearch = async (query) => {
    if (!query.trim()) return;
    analytics.track('search_query_typed', { query: query.trim(), resultCount: filteredSkills.length });
    try {
      const result = await apiService.searchSkill(query.trim());
      navigate(`/skills/${result.skill.id}`);
    } catch (err) {
      console.error('Search error:', err);
      // Fallback: navigate with a best-guess slug
      const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
      navigate(`/skills/${slug}`);
    }
  };

  // Client-side filter for the skill cards while typing
  const filteredSkills = skills.filter((skill) => {
    const q = searchQuery.toLowerCase();
    return (
      skill.name.toLowerCase().includes(q) ||
      (skill.description || '').toLowerCase().includes(q) ||
      (skill.category || '').toLowerCase().includes(q)
    );
  });

  // When not searching, show only curated featured skills in priority order
  const displayedSkills = searchQuery
    ? filteredSkills
    : FEATURED_SKILL_IDS.map(id => skills.find(s => s.id === id)).filter(Boolean);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SkillAggregator',
    url: SITE_URL || 'https://skillaggregator.com',
    description: 'Curated YouTube videos and articles for any skill you want to learn.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL || 'https://skillaggregator.com'}/skills/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <div>
      <Helmet>
        <title>SkillAggregator — Learn Any Skill with Curated Resources</title>
        <meta name="description" content="Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning." />
        <meta property="og:title" content="SkillAggregator — Learn Any Skill with Curated Resources" />
        <meta property="og:description" content="Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={SITE_URL + '/'} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* Hero */}
      <section className="search-container text-white py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Learn any skill with the best
            <span className="block text-yellow-300">resources on the internet</span>
          </h1>
          <p className="text-xl md:text-2xl mb-10 opacity-90">
            We curate top-rated YouTube videos and articles for any skill — so you skip the noise and get straight to learning.
          </p>

          <div className="max-w-2xl mx-auto mb-8">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              skills={skills}
              placeholder="Search Python, Kubernetes, Design…"
            />
          </div>

          <Link
            to="/early-access"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors"
          >
            Get the weekly digest <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How It Works */}
      {!searchQuery && (
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">How It Works</h2>
              <p className="text-gray-500 text-lg">From search to learning in seconds</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Search className="w-7 h-7 text-white" />,
                  title: 'Search any skill',
                  description: 'Type what you want to learn — Python, Kubernetes, design, anything.',
                },
                {
                  icon: <BookOpen className="w-7 h-7 text-white" />,
                  title: 'Browse curated, quality-ranked content',
                  description: 'We surface the top-rated YouTube videos and articles so you skip the noise.',
                },
                {
                  icon: <ListChecks className="w-7 h-7 text-white" />,
                  title: 'Enroll and follow a structured plan',
                  description: 'Enroll in a skill and follow a clear learning path from beginner to confident.',
                },
              ].map((item, idx) => (
                <div key={idx} className="text-center">
                  <div className="w-14 h-14 bg-primary-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Popular Skills / Search Results */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              {searchQuery ? 'Search Results' : 'Popular skills to explore'}
            </h2>
            <p className="text-gray-500 text-lg">
              {searchQuery
                ? `${filteredSkills.length} skill${filteredSkills.length !== 1 ? 's' : ''} matching "${searchQuery}"`
                : 'Pick a skill to explore curated learning resources'}
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-20 space-y-4">
              <LoadingSpinner />
              <p className="text-gray-500">Loading skills…</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-500 mb-4">{error}</p>
              <button onClick={loadSkills} className="btn-primary">
                Retry
              </button>
            </div>
          ) : displayedSkills.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No skills found</h3>
              <p className="text-gray-500 mb-4">
                Press Enter or click &ldquo;Search for {searchQuery}&rdquo; to find resources for this skill.
              </p>
              <button onClick={() => setSearchQuery('')} className="btn-secondary">
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  contentCount={contentCounts[skill.id]}
                  onClick={() => analytics.track('skill_card_clicked', { skillId: skill.id, skillName: skill.name })}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
