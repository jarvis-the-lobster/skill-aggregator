import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Sparkles, Check, AlertCircle, Loader2, X, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import analytics from '../services/analytics';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }) {
  const styles = {
    active: 'bg-teal/15 text-teal border-teal/30',
    cancelled: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    past_due: 'bg-red-500/10 text-red-300 border-red-500/20',
    free: 'bg-white/[0.06] text-slate-300 border-white/[0.12]',
  };
  const labels = {
    active: 'Active',
    cancelled: 'Cancels at period end',
    past_due: 'Payment issue',
    free: 'Free plan',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.free}`}>
      {status === 'active' && <Check className="w-3 h-3" />}
      {status === 'past_due' && <AlertCircle className="w-3 h-3" />}
      {labels[status] || labels.free}
    </span>
  );
}

export function AccountPage() {
  const { user, loading: authLoading } = useAuth();
  const { status, subscriptionEndDate, cancelAtPeriodEnd, isTrialing, loading: subLoading, refresh } = useSubscription();
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user) {
      analytics.accountPageViewed({ status, is_premium: status === 'active' });
    }
  }, [authLoading, user, status]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login?next=/account" replace />;

  async function startCheckout() {
    setError('');
    setCheckoutLoading(true);
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
      analytics.premiumCheckoutStarted('account_page');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setCheckoutLoading(false);
    }
  }

  async function cancelSubscription() {
    setError('');
    setBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/billing/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      await refresh();
      setShowConfirm(false);
      analytics.track('subscription_cancelled', { source: 'account_page' });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const hasFutureEndDate = Boolean(subscriptionEndDate && new Date(subscriptionEndDate) > new Date());
  const cancelledTrial = status === 'active' && isTrialing && cancelAtPeriodEnd;
  const cancelledButStillActive = status === 'cancelled' && hasFutureEndDate;
  const effectiveStatus = cancelledButStillActive ? 'cancelled' : (status === 'cancelled' ? 'free' : status);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Helmet>
        <title>Account — LearnStack</title>
      </Helmet>

      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-100 mb-2 tracking-tight">Account</h1>
          <p className="text-slate-400">Manage your subscription and billing.</p>
        </div>

        {/* Profile card */}
        <div className="bg-dark-card rounded-xl border border-white/[0.08] p-8 mb-8">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-6">Profile</h2>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Name</div>
              <div className="text-slate-100">{user.name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Email</div>
              <div className="text-slate-100">{user.email}</div>
            </div>
          </div>
        </div>

        {/* Subscription card */}
        <div className="bg-dark-card rounded-xl border border-white/[0.08] p-8">
          <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
            <div>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">Subscription</h2>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-slate-100">
                  {cancelledTrial ? 'Premium Trial' : (effectiveStatus === 'active' || effectiveStatus === 'cancelled' ? 'Premium' : 'Free')}
                </span>
                <StatusBadge status={effectiveStatus} />
              </div>
            </div>
            {(effectiveStatus === 'active' || effectiveStatus === 'cancelled') && (
              <div className="text-right">
                <div className="text-xs text-slate-500 mb-1">
                  {cancelledTrial ? 'Trial ends on' : (effectiveStatus === 'cancelled' ? 'Ends on' : 'Renews on')}
                </div>
                <div className="text-slate-200 font-medium">{formatDate(subscriptionEndDate)}</div>
              </div>
            )}
          </div>

          {subLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : effectiveStatus === 'active' ? (
            <div>
              {cancelledTrial ? (
                <>
                  <p className="text-slate-400 mb-6 leading-relaxed">
                    Your Premium trial is active until {formatDate(subscriptionEndDate)}, and it will end automatically on that date. You will not be charged unless you reactivate before the trial ends.
                  </p>
                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={checkoutLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Resume Premium after trial
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-400 mb-6 leading-relaxed">
                    You have full access to all premium features. Cancel anytime, you'll keep access until the end of your billing period.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] px-6 py-3 text-sm font-medium text-slate-200 transition-all duration-200 hover:border-red-500/30 hover:text-red-300 hover:bg-red-500/[0.05]"
                  >
                    Cancel subscription
                  </button>
                </>
              )}
            </div>
          ) : effectiveStatus === 'cancelled' ? (
            <div>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Your subscription is cancelled. You'll keep premium access until {formatDate(subscriptionEndDate)}, then revert to the free plan.
              </p>
              <button
                type="button"
                onClick={startCheckout}
                disabled={checkoutLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Reactivate
              </button>
            </div>
          ) : status === 'past_due' ? (
            <div>
              <p className="text-red-300 mb-6 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                There was a problem with your last payment. Update your billing method to restore access.
              </p>
              <button
                type="button"
                onClick={startCheckout}
                disabled={checkoutLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4" />
                Update billing
              </button>
            </div>
          ) : (
            <div>
              <p className="text-slate-400 mb-6 leading-relaxed">
                You're on the free plan. Upgrade to Premium for personalized plans, unlimited active courses, streak freezes, and more.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Upgrade to Premium — $9/month
                </button>
                <Link
                  to="/premium"
                  className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-100"
                >
                  See what's included →
                </Link>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in">
          <div className="bg-dark-card rounded-xl border border-white/[0.1] p-8 max-w-md w-full relative">
            <button
              type="button"
              onClick={() => !busy && setShowConfirm(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-bold text-slate-100 mb-3">Cancel subscription?</h3>
            <p className="text-slate-400 mb-8 leading-relaxed">
              You'll keep premium access until <strong className="text-slate-200">{formatDate(subscriptionEndDate)}</strong>. After that, you'll return to the free plan.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.12] px-6 py-3 text-sm font-medium text-slate-200 transition-all duration-200 hover:bg-white/[0.04] disabled:opacity-60"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={cancelSubscription}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition-all duration-200 hover:bg-red-500/25 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, cancel
              </button>
            </div>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
