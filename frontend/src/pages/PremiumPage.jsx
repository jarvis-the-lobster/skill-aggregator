import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Sparkles, Check, Zap, Flame, Brain, Rocket, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import analytics from '../services/analytics';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const FEATURES = [
  {
    icon: Rocket,
    title: 'All 30 plan days',
    description: 'Unlock the full 30-day learning roadmap for every skill. No more day-7 cliff.',
  },
  {
    icon: Flame,
    title: 'Streak freeze every 48h',
    description: 'Life happens. Keep your streak alive with an automatic freeze every other day.',
  },
  {
    icon: Brain,
    title: 'AI Coach',
    description: 'Personalized guidance, answers, and quick reviews. (Coming soon.)',
    soon: true,
  },
  {
    icon: Zap,
    title: 'Priority content updates',
    description: 'First access to new skills, curated drops, and weekly refreshes.',
  },
];

export function PremiumPage() {
  const { user } = useAuth();
  const { isPremium, status } = useSubscription();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function startCheckout() {
    if (!user) {
      navigate('/login?next=/premium');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Unable to start checkout');
      }
      analytics.track('premium_checkout_started');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Helmet>
        <title>Premium — LearnStack</title>
        <meta name="description" content="Unlock the full LearnStack experience: all 30 plan days, streak freezes, AI coach, and priority updates." />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.08]">
        <div className="absolute inset-0 bg-gradient-to-br from-teal/20 via-dark-bg to-dark-bg pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,191,166,0.18),transparent_60%)] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 lg:px-8 py-24 lg:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-teal/15 text-teal text-sm font-medium px-4 py-2 rounded-full mb-8 border border-teal/20 animate-fade-in">
            <Sparkles className="w-4 h-4" />
            <span>LearnStack Premium</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-100 mb-6 leading-[1.05] tracking-tight">
            Go further,<br />
            <span className="bg-gradient-to-r from-teal to-teal-light bg-clip-text text-transparent">faster.</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-xl mx-auto mb-12 leading-relaxed">
            Unlock every day of every plan, keep your streak unbreakable, and get the tools serious learners need.
          </p>

          <div className="flex flex-col items-center gap-4">
            {isPremium ? (
              <Link
                to="/account"
                className="inline-flex items-center gap-2 rounded-xl bg-teal px-8 py-4 text-base font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_12px_32px_rgba(0,191,166,0.4)]"
              >
                <Check className="w-5 h-5" />
                You're Premium — Manage
              </Link>
            ) : (
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="group inline-flex items-center gap-3 rounded-xl bg-teal px-8 py-4 text-base font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_12px_32px_rgba(0,191,166,0.4)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Redirecting to Stripe…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
                    Upgrade to Premium
                  </>
                )}
              </button>
            )}

            <div className="flex items-baseline gap-1.5 text-slate-300">
              <span className="text-3xl font-bold text-slate-100">$9</span>
              <span className="text-slate-400">/month</span>
              <span className="ml-2 text-xs text-slate-500">cancel anytime</span>
            </div>

            {status === 'cancelled' && (
              <p className="text-sm text-slate-400">
                Your subscription was cancelled — upgrading will start a new one.
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-4">What you get</h2>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">Everything you need to stay focused and keep learning.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {FEATURES.map(({ icon: Icon, title, description, soon }) => (
            <div
              key={title}
              className="group relative bg-dark-card rounded-xl border border-white/[0.08] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-teal/30 hover:shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal/10 text-teal mb-6 transition-transform duration-300 group-hover:scale-110">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                {soon && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
              </div>
              <p className="text-slate-400 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      {!isPremium && (
        <section className="border-t border-white/[0.08] bg-dark-card/30">
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-24 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-4">
              Ready to level up?
            </h2>
            <p className="text-lg text-slate-400 mb-12 max-w-lg mx-auto">
              $9/month. Cancel anytime. 100% of the content, 0% of the friction.
            </p>
            <button
              type="button"
              onClick={startCheckout}
              disabled={loading}
              className="inline-flex items-center gap-3 rounded-xl bg-teal px-8 py-4 text-base font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_12px_32px_rgba(0,191,166,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Redirecting…
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Upgrade to Premium
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
