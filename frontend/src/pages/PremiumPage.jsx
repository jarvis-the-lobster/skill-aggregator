import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Sparkles, Check, Zap, Flame, Brain, Rocket, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import analytics from '../services/analytics';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const FEATURES = [
  {
    icon: Brain,
    title: 'Personalized learning plans',
    description: 'Plans built around your goals, schedule, and pace — not a one-size-fits-all template.',
  },
  {
    icon: Rocket,
    title: 'Unlimited active plans',
    description: 'Learn multiple skills at once. Switch between plans freely without losing your progress.',
  },
  {
    icon: Flame,
    title: 'Streak freeze every 48h',
    description: 'Life happens. Keep your streak alive with an automatic freeze every other day.',
  },
  {
    icon: Zap,
    title: 'Priority content updates',
    description: 'First access to new skills, curated drops, and weekly content refreshes.',
  },
];

export function PremiumPage() {
  const { user } = useAuth();
  const { isPremium, status } = useSubscription();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hasUsedTrial = Number(user?.premium_trial_starts_count || 0) > 0;

  useEffect(() => {
    analytics.premiumPageViewed({ is_premium: isPremium, status });
  }, [isPremium, status]);

  async function startCheckout(source = 'premium_page') {
    if (!user) {
      analytics.premiumCheckoutStarted(`${source}_unauthenticated`);
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
      if (res.status === 409 && data.error === 'existing_subscription') {
        setError(data.message || 'You already have an active subscription.');
        setLoading(false);
        return;
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Unable to start checkout');
      }
      analytics.premiumCheckoutStarted(source, { status });
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
        <meta name="description" content="LearnStack Premium: personalized learning plans, unlimited active courses, streak freezes, and more." />
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
            Learning that fits<br />
            <span className="bg-gradient-to-r from-teal to-teal-light bg-clip-text text-transparent">you.</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-xl mx-auto mb-12 leading-relaxed">
            Personalized plans built around your goals and schedule, unlimited active courses, and the tools to stay consistent.
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
                onClick={() => startCheckout('premium_hero_cta')}
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
                    {hasUsedTrial ? 'Upgrade to Premium' : 'Start free 7-day trial'}
                  </>
                )}
              </button>
            )}

            <div className="flex items-baseline gap-1.5 text-slate-300">
              <span className="text-3xl font-bold text-slate-100">$9</span>
              <span className="text-slate-400">/month</span>
              <span className="ml-2 text-xs text-slate-500">cancel anytime</span>
            </div>

            {!isPremium && (
              <p className="text-sm text-slate-400">
                {hasUsedTrial ? 'Your free trial has already been used on this account.' : 'Includes a 7-day free trial for first-time Premium accounts.'}
              </p>
            )}

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
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group relative bg-dark-card rounded-xl border border-white/[0.08] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-teal/30 hover:shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal/10 text-teal mb-6 transition-transform duration-300 group-hover:scale-110">
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
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
              {hasUsedTrial
                ? '$9/month. Cancel anytime. Built for people who actually want to follow through.'
                : 'Try Premium free for 7 days, then $9/month. Cancel anytime.'}
            </p>
            <button
              type="button"
              onClick={() => startCheckout('premium_footer_cta')}
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
                  {hasUsedTrial ? 'Upgrade to Premium' : 'Start free 7-day trial'}
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
