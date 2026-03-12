import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Mail, BookOpen, Video, FileText, Zap, Users } from 'lucide-react';
import { apiService } from '../services/api';

const CATEGORIES = [
  { id: 'programming', label: 'Programming', emoji: '💻' },
  { id: 'design', label: 'Design', emoji: '🎨' },
  { id: 'business', label: 'Business', emoji: '📈' },
  { id: 'data-science', label: 'Data Science', emoji: '🔬' },
  { id: 'marketing', label: 'Marketing', emoji: '📣' },
];

export function EarlyAccessPage() {
  const [email, setEmail] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [subscriberCount, setSubscriberCount] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    apiService.getSubscriberCount()
      .then(data => setSubscriberCount(data.count))
      .catch(() => {}); // fail silently
  }, []);

  function toggleCategory(id) {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      await apiService.subscribeToNewsletter(email.trim(), selectedCategories);
      setStatus('success');
      setSubscriberCount(prev => prev !== null ? prev + 1 : null);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Get Early Access — SkillAggregator</title>
        <meta name="description" content="Join the SkillAggregator early access list and get a weekly digest of the best curated learning resources for the skills that matter to you." />
        <meta property="og:title" content="Get Early Access — SkillAggregator" />
        <meta property="og:description" content="Join the SkillAggregator early access list and get a weekly digest of the best curated learning resources." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/early-access`} />
      </Helmet>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-500 to-indigo-700 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 text-white text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" />
            <span>Launching soon</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight">
            The best way to learn any skill
          </h1>
          <p className="text-lg sm:text-xl text-white/85 max-w-xl mx-auto mb-8">
            Every week, we hand-pick the top videos, articles, and guides for the skills you want to learn. Free, curated, no noise.
          </p>

          {subscriberCount !== null && subscriberCount > 0 && (
            <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-4">
              <Users className="w-4 h-4" />
              <span>Join <strong className="text-white">{subscriberCount.toLocaleString()}</strong> {subscriberCount === 1 ? 'person' : 'people'} getting early access</span>
            </div>
          )}
        </div>
      </section>

      {/* Subscribe form */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {status === 'success' ? (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're on the list!</h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              We'll send your first curated digest as soon as we launch. Keep an eye on your inbox.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-1 text-center">Get early access</h2>
            <p className="text-gray-500 text-center mb-8">Tell us what you want to learn and we'll curate it for you.</p>

            {/* Category picker */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">What do you want to learn? <span className="font-normal text-gray-400">(optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                      selectedCategories.includes(cat.id)
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Email + submit */}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-grow">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="btn-primary py-3 px-6 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? 'Subscribing…' : 'Get early access'}
              </button>
            </form>

            {status === 'error' && (
              <p className="mt-3 text-sm text-red-600 text-center">{errorMessage}</p>
            )}

            <p className="mt-3 text-xs text-gray-400 text-center">No spam. Unsubscribe anytime.</p>
          </>
        )}
      </section>

      {/* What you get */}
      <section className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h2 className="text-xl font-bold text-gray-900 mb-8 text-center">What's in every issue</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 rounded-xl mb-3">
                <Video className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Top videos</h3>
              <p className="text-sm text-gray-500">The most-watched, highest-rated tutorials for each skill — no filler.</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-50 rounded-xl mb-3">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Best articles</h3>
              <p className="text-sm text-gray-500">Curated reads from trusted sources, ranked by quality and relevance.</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-50 rounded-xl mb-3">
                <BookOpen className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Structured guides</h3>
              <p className="text-sm text-gray-500">Step-by-step courses and paths so you always know what to learn next.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
