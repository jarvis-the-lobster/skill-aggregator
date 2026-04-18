import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Sparkles, Check, ArrowRight } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import analytics from '../services/analytics';

export function PremiumSuccessPage() {
  const { refresh, isPremium, status } = useSubscription();
  const [checking, setChecking] = useState(true);
  const trackedRef = useRef(false);

  useEffect(() => {
    analytics.premiumSuccessViewed();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      // Poll a few times — webhook may lag a beat behind the redirect.
      for (let i = 0; i < 5; i++) {
        const data = await refresh();
        if (cancelled) return;
        if (data?.status === 'active') {
          if (!trackedRef.current) {
            trackedRef.current = true;
            analytics.premiumCheckoutSucceeded({ status: 'active' });
          }
          setChecking(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (!cancelled) setChecking(false);
    }
    confirm();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-6 py-24">
      <Helmet>
        <title>Welcome to Premium — LearnStack</title>
      </Helmet>

      <div className="relative max-w-xl w-full text-center">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,191,166,0.18),transparent_70%)] pointer-events-none" />

        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal/15 border border-teal/30 mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal text-dark-bg">
            <Check className="w-8 h-8" strokeWidth={3} />
          </div>
        </div>

        <div className="inline-flex items-center gap-2 bg-teal/15 text-teal text-sm font-medium px-4 py-2 rounded-full mb-6 border border-teal/20">
          <Sparkles className="w-4 h-4" />
          <span>Premium activated</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-100 mb-6 leading-tight tracking-tight">
          You're Premium! 🎉
        </h1>

        <p className="text-lg text-slate-400 mb-12 max-w-md mx-auto leading-relaxed">
          {checking && !isPremium
            ? "We're confirming your subscription… this usually takes just a second."
            : "Every day of every plan is now unlocked. Your streak has a 48-hour safety net. Let's keep going."}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link
            to="/my-courses"
            className="group inline-flex items-center gap-2 rounded-xl bg-teal px-8 py-4 text-base font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_12px_32px_rgba(0,191,166,0.4)]"
          >
            Go to your courses
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/account"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] px-8 py-4 text-base font-medium text-slate-200 transition-all duration-200 hover:border-teal/40 hover:bg-white/[0.04]"
          >
            Manage account
          </Link>
        </div>

        {!checking && !isPremium && status !== 'active' && (
          <p className="mt-8 text-sm text-slate-500">
            Payment received, but the subscription hasn't synced yet. Refresh in a moment or contact support if this persists.
          </p>
        )}
      </div>
    </div>
  );
}
