import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Check, Star } from 'lucide-react';
import { apiService } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import analytics from '../services/analytics';

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : '';

const FEATURED_SKILLS = [
  { id: 'python', name: 'Python Programming', icon: '🐍', category: 'Programming', catClass: 'bg-blue-400/15 text-blue-400' },
  { id: 'javascript', name: 'JavaScript', icon: '⚡', category: 'Programming', catClass: 'bg-blue-400/15 text-blue-400' },
  { id: 'ui-ux-design', name: 'UI/UX Design', icon: '🎨', category: 'Design', catClass: 'bg-pink-400/15 text-pink-400' },
  { id: 'digital-marketing', name: 'Digital Marketing', icon: '📈', category: 'Marketing', catClass: 'bg-yellow-400/15 text-yellow-400' },
  { id: 'machine-learning', name: 'Machine Learning', icon: '🤖', category: 'Data Science', catClass: 'bg-sky-400/15 text-sky-400' },
  { id: 'photography', name: 'Photography', icon: '📷', category: 'Creative', catClass: 'bg-emerald-400/15 text-emerald-400' },
];

// Hook for IntersectionObserver scroll reveals
function useScrollReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -48px 0px' }
    );

    const el = ref.current;
    if (el) {
      el.querySelectorAll('.fade-up').forEach((node) => observer.observe(node));
    }

    return () => observer.disconnect();
  }, []);

  return ref;
}

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState([]);
  const [featuredCounts, setFeaturedCounts] = useState({});
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const revealRef = useScrollReveal();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm = {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
    };
    if (utm.utm_source) localStorage.setItem('utm_params', JSON.stringify(utm));

    analytics.track('homepage_viewed', {
      referrer: document.referrer || 'direct',
      landing: !document.referrer,
      ...utm,
    });
    loadSkills();
    loadFeaturedCounts();
  }, []);


  const loadSkills = async () => {
    try {
      const data = await apiService.getSkills();
      setSkills(data.skills || []);
    } catch (err) {
      console.error('Error loading skills:', err);
    }
  };

  const loadFeaturedCounts = async () => {
    try {
      const counts = await apiService.getSkillContentCounts(FEATURED_SKILLS.map(s => s.id));
      setFeaturedCounts(counts);
    } catch (err) {
      console.error('Error loading featured counts:', err);
    }
  };

  const handleSearch = async (query) => {
    if (!query.trim()) return;
    analytics.track('search_query_typed', { query: query.trim() });
    try {
      const result = await apiService.searchSkill(query.trim());
      if (result.status === 'blocked' || result.status === 'rate_limited') {
        setError(result.message || 'This search is not allowed.');
        return;
      }
      if (!result.skill?.id) {
        setError('Could not find that skill. Try a different search.');
        return;
      }
      navigate(`/skills/${result.skill.id}`);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
    }
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'LearnStack',
    url: SITE_URL || 'https://learnstack.dev',
    description: 'Curated YouTube videos and articles for any skill you want to learn.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL || 'https://learnstack.dev'}/skills/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <div ref={revealRef} className="bg-dark-bg text-slate-100">
      <Helmet>
        <title>LearnStack — Learn Any Skill with Curated Resources</title>
        <meta name="description" content="Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning." />
        <meta property="og:title" content="LearnStack — Learn Any Skill with Curated Resources" />
        <meta property="og:description" content="Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="LearnStack — Learn Any Skill with Curated Resources" />
        <meta name="twitter:description" content="Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning." />
        <link rel="canonical" href={SITE_URL + '/'} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex items-center pt-32 pb-24 overflow-hidden">
        {/* Glow orbs */}
        <div className="absolute w-[800px] h-[800px] rounded-full pointer-events-none blur-[120px] top-[10%] left-[55%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(0,191,166,0.18)_0%,transparent_70%)] hero-glow-1" />
        <div className="absolute w-[800px] h-[800px] rounded-full pointer-events-none blur-[120px] top-[30%] left-[65%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(0,191,166,0.08)_0%,transparent_70%)] hero-glow-2" />

        <div className="max-w-[1200px] mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-teal/30 rounded-full text-[13px] font-medium text-teal bg-teal/[0.06] mb-6 hero-animate">
              <span>🎯</span> 200+ skills available
            </div>
            <h1 className="text-5xl md:text-[68px] font-extrabold leading-[1.05] tracking-tight mb-6 hero-animate hero-animate-delay-1">
              Learn any skill with<br />
              <span className="gradient-text-teal">a clear 30-day plan.</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-[480px] mb-8 leading-relaxed hero-animate hero-animate-delay-2">
              Find the best free videos and articles for any skill, ranked by quality and organized into a step-by-step path.
            </p>

            {/* Search bar */}
            <div className="max-w-md mb-6 hero-animate hero-animate-delay-2 relative z-[60]">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleSearch}
                onSuggestionSelect={(skill) => navigate(`/skills/${skill.id}`)}
                skills={skills}
                placeholder="Search Python, Kubernetes, Design…"
              />
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>

            <div className="flex gap-4 mb-8 hero-animate hero-animate-delay-3">
              <a
                href="#skills"
                className="inline-flex items-center gap-2 bg-transparent text-slate-100 font-semibold text-sm px-5 py-2.5 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all hover:-translate-y-px"
              >
                Browse Skills
              </a>
            </div>

            <div className="flex items-center gap-3 hero-animate hero-animate-delay-4">
              <div className="flex">
                {['bg-gradient-to-br from-pink-400 to-pink-500', 'bg-gradient-to-br from-teal to-teal-deep', 'bg-gradient-to-br from-emerald-400 to-emerald-500', 'bg-gradient-to-br from-amber-400 to-amber-500'].map((bg, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full border-2 border-dark-bg flex items-center justify-center text-xs font-semibold ${bg} ${i > 0 ? '-ml-2' : ''}`}>
                    {['A', 'K', 'M', 'S'][i]}
                  </div>
                ))}
              </div>
              <span className="text-[13px] text-slate-400">
                Join <strong className="text-slate-100">1,000+ learners</strong> already leveling up
              </span>
            </div>
          </div>

          {/* Right: Product mockup */}
          <div className="hidden lg:block hero-animate hero-animate-delay-3">
            <div className="mockup-float bg-dark-card rounded-2xl border border-white/[0.08] overflow-hidden shadow-[0_48px_96px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.08]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <div className="flex-1 ml-2 bg-white/[0.06] rounded-md px-3 py-1.5 text-xs text-slate-400">
                  learnstack.dev/plan/python
                </div>
              </div>
              {/* Content */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="text-xl font-bold tracking-tight">🐍 Python Programming</div>
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-teal/15 text-teal">Day 12 of 30</div>
                </div>
                <div className="h-1.5 bg-white/[0.08] rounded-full mb-6 overflow-hidden">
                  <div className="h-full w-[40%] bg-gradient-to-r from-teal to-teal-light rounded-full" />
                </div>
                {[
                  { done: true, label: 'Day 10 — Functions & Scope', desc: 'Corey Schafer · 18 min watch', type: 'Video', typeClass: 'bg-red-500/15 text-red-400' },
                  { done: true, label: 'Day 11 — List Comprehensions', desc: 'Real Python · 8 min read', type: 'Article', typeClass: 'bg-blue-400/15 text-blue-400' },
                  { current: true, label: 'Day 12 — Error Handling', desc: 'Tech With Tim · 22 min watch', type: 'Video', typeClass: 'bg-red-500/15 text-red-400' },
                  { done: false, label: 'Day 13 — Mini Project', desc: 'Build a CLI quiz app', type: 'Project', typeClass: 'bg-yellow-400/15 text-yellow-400' },
                ].map((day, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-[10px] mb-2 hover:bg-white/[0.03] transition-colors ${
                      day.current ? 'bg-teal/[0.06]' : ''
                    }`}
                  >
                    <div className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      day.done
                        ? 'bg-teal border-teal'
                        : day.current
                          ? 'border-teal'
                          : 'border-white/15'
                    }`}>
                      {day.done && <Check className="w-3 h-3 text-dark-bg" />}
                    </div>
                    <div className="flex-1">
                      <div className={`text-[13px] font-semibold ${day.current ? 'text-teal' : ''}`}>
                        {day.label}
                      </div>
                      <div className="text-xs text-slate-400">{day.desc}</div>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${day.typeClass}`}>
                      {day.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUST BAR ===== */}
      <section className="py-16 border-t border-b border-white/[0.08]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center text-[13px] font-medium text-slate-400 uppercase tracking-widest mb-8 fade-up">
            Trusted content from
          </div>
          <div className="flex items-center justify-center gap-12 flex-wrap fade-up delay-1">
            {[
              <><span className="text-red-500/40">▶</span> YouTube</>,
              <>DEV<span className="opacity-40">.to</span></>,
              <>Medium</>,
              <><span className="text-green-500/40">{'{ }'}</span> freeCodeCamp</>,
              <><span className="text-red-500/40">TED</span><span className="opacity-40">x</span></>,
            ].map((logo, i) => (
              <div key={i} className="text-lg font-bold text-white/20 tracking-tight hover:text-white/40 transition-colors cursor-default">
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-32 bg-dark-card border-y border-white/[0.06] text-slate-100">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-[13px] font-semibold uppercase tracking-widest text-teal mb-4 fade-up">How it works</div>
          <h2 className="text-4xl md:text-[48px] font-extrabold tracking-tight leading-[1.1] mb-4 text-slate-100 fade-up delay-1">
            From zero to skilled in 30 days
          </h2>
          <p className="text-lg text-slate-400 max-w-[560px] mb-16 fade-up delay-2">
            Three steps. No signup walls. No credit card. Just pick a skill and start learning.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative steps-connector">
            {[
              { num: 1, icon: '🔍', title: 'Search any skill', desc: 'Type any skill you want to learn — from Python to Photography. We\'ve got 200+ ready to go.' },
              { num: 2, icon: '📚', title: 'Get your plan', desc: 'We curate the best videos and articles from across the web, ranked by quality and structured into daily lessons.' },
              { num: 3, icon: '🏆', title: 'Track progress', desc: 'Complete your daily plan, maintain your streak, and go from beginner to competent in 30 days.' },
            ].map((step, i) => (
              <div key={i} className={`text-center relative z-10 fade-up delay-${i + 1}`}>
                <div className="w-12 h-12 rounded-full bg-teal text-dark-bg text-lg font-extrabold flex items-center justify-center mx-auto mb-6">
                  {step.num}
                </div>
                <div className="text-[32px] mb-4">{step.icon}</div>
                <h3 className="text-xl font-bold tracking-tight mb-2">{step.title}</h3>
                <p className="text-[15px] text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SKILLS GRID ===== */}
      <section id="skills" className="py-32 bg-dark-bg">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center text-[13px] font-semibold uppercase tracking-widest text-teal mb-4 fade-up">Explore skills</div>
          <h2 className="text-center text-4xl md:text-[48px] font-extrabold tracking-tight leading-[1.1] mb-4 fade-up delay-1">
            What will you learn today?
          </h2>
          <p className="text-center text-lg text-slate-400 max-w-[560px] mx-auto mb-16 fade-up delay-2">
            Every plan is free. Every resource is hand-picked. Just choose your skill.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURED_SKILLS.map((skill, i) => (
              <Link
                key={skill.id}
                to={`/skills/${skill.id}`}
                onClick={() => analytics.track('skill_card_clicked', { skillId: skill.id, skillName: skill.name })}
                className={`premium-skill-card bg-dark-card border border-white/[0.08] rounded-2xl p-8 cursor-pointer relative overflow-hidden block fade-up delay-${(i % 3) + 1}`}
              >
                <span className="text-4xl block mb-4">{skill.icon}</span>
                <h3 className="text-lg font-bold tracking-tight mb-2">{skill.name}</h3>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-4 ${skill.catClass}`}>
                  {skill.category}
                </span>
                <p className="text-[13px] text-slate-400 mb-2">{featuredCounts[skill.id] || '—'} resources curated</p>
                <span className="skill-card-link-text inline-flex items-center gap-1 text-sm font-semibold text-teal">
                  Learn Now <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== STATS STRIP ===== */}
      <section className="py-24 border-t border-b border-white/[0.08] bg-dark-bg">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            {[
              { number: '200+', label: 'Skills available' },
              { number: '10,000+', label: 'Resources curated' },
              { number: 'Free', label: 'Forever for core features' },
            ].map((stat, i) => (
              <div key={i} className={`relative fade-up delay-${i + 1} ${i < 2 ? 'md:stat-divider' : ''}`}>
                <div className="text-5xl md:text-[56px] font-extrabold tracking-tighter leading-none mb-2 stat-number-gradient">
                  {stat.number}
                </div>
                <div className="text-[15px] text-slate-400 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURE HIGHLIGHTS ===== */}
      <section className="py-32 bg-dark-card border-y border-white/[0.06] text-slate-100">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Feature 1: Quality Ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center mb-32 fade-up">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-widest text-teal mb-4">Smart Curation</div>
              <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.15] mb-4 text-slate-100">
                Quality over quantity
              </h3>
              <p className="text-base text-slate-400 leading-relaxed mb-6">
                We don't just dump links at you. Every resource is scored by engagement, clarity, and relevance — so you always learn from the best content available.
              </p>
              <div className="flex flex-col gap-3">
                {['Ranked by quality score, not recency', 'Mix of videos, articles, and projects', 'Updated regularly as new content surfaces'].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-[15px] text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-teal" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="feature-visual-card">
              <div className="text-[13px] font-semibold text-slate-400 mb-4 uppercase tracking-wider">Top Resources — JavaScript</div>
              {[
                { rank: '#1', rankClass: 'bg-teal/20 text-teal', title: 'JavaScript Crash Course for Beginners', meta: 'Traversy Media · 1.2M views', score: '9.4' },
                { rank: '#2', rankClass: 'bg-blue-400/15 text-blue-400', title: 'The Modern JavaScript Tutorial', meta: 'javascript.info · Article', score: '9.2' },
                { rank: '#3', rankClass: 'bg-yellow-400/12 text-yellow-400', title: 'Learn JS in 100 Days — Full Course', meta: 'freeCodeCamp · 890K views', score: '9.0' },
              ].map((res, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl bg-white/[0.04] mb-3 border border-white/[0.06] last:mb-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${res.rankClass}`}>
                    {res.rank}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-100 mb-1">{res.title}</div>
                    <div className="text-xs text-slate-400 flex gap-3">
                      <span>{res.meta}</span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-teal">
                        <Star className="w-3 h-3 fill-current" /> {res.score}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature 2: Learning Plan (reversed) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center fade-up">
            <div className="lg:order-2">
              <div className="text-[13px] font-semibold uppercase tracking-widest text-teal mb-4">Structured Learning</div>
              <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-[1.15] mb-4 text-slate-100">
                Your personal learning plan
              </h3>
              <p className="text-base text-slate-400 leading-relaxed mb-6">
                No more "what should I learn next?" Every skill has a structured 30-day plan that takes you from zero to confident. Check off each day as you go.
              </p>
              <div className="flex flex-col gap-3">
                {['Daily lessons of 15–30 minutes', 'Progressive difficulty — never overwhelmed', 'Streaks keep you accountable'].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-[15px] text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-teal" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:order-1 feature-visual-card">
              <div className="flex items-center justify-between mb-6">
                <div className="text-lg font-bold text-slate-100">🎨 UI/UX Design</div>
                <div className="text-[13px] font-semibold text-teal">Week 2 of 4</div>
              </div>
              {[
                { checked: true, day: 'Day 8', desc: 'Color Theory Fundamentals', time: '18 min' },
                { checked: true, day: 'Day 9', desc: 'Typography Best Practices', time: '22 min' },
                { active: true, day: 'Day 10', desc: 'Layout & Spacing Systems', time: '25 min' },
                { checked: false, day: 'Day 11', desc: 'Responsive Design Principles', time: '20 min' },
                { checked: false, day: 'Day 12', desc: 'Mini Project: Redesign a landing page', time: '45 min' },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-[10px] mb-2 border transition-all ${
                    row.active
                      ? 'bg-teal/[0.08] border-teal/20'
                      : 'bg-white/[0.03] border-transparent hover:bg-white/[0.05] hover:border-white/[0.08]'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    row.checked
                      ? 'bg-teal border-teal'
                      : 'border-white/15'
                  }`}>
                    {row.checked && <Check className="w-3 h-3 text-dark-bg" />}
                  </div>
                  <div className={`text-[13px] font-semibold min-w-[48px] ${row.active ? 'text-teal' : 'text-slate-100'}`}>
                    {row.day}
                  </div>
                  <div className="flex-1 text-[13px] text-slate-400">{row.desc}</div>
                  <div className="text-xs text-slate-400">{row.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-32 bg-dark-bg text-center relative overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(0,191,166,0.12)_0%,transparent_70%)] blur-[80px] pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 relative">
          <h2 className="text-4xl md:text-[48px] font-extrabold tracking-tight mb-4 fade-up">
            Start learning anything today.
          </h2>
          <p className="text-lg text-slate-400 mb-12 fade-up delay-1">
            No credit card. No commitment. Just learning.
          </p>
          <a
            href="#skills"
            className="inline-flex items-center gap-2 bg-teal text-dark-bg font-semibold text-base px-8 py-4 rounded-xl hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] transition-all duration-250 hover:-translate-y-px hover:scale-[1.02] btn-cta-glow fade-up delay-2"
          >
            Start Learning <ArrowRight className="w-[18px] h-[18px]" />
          </a>
        </div>
      </section>

      {/* Footer provided by shared LayoutShell */}
    </div>
  );
}
