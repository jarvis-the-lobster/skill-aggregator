import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function useSubscription() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState(user?.subscription_status || 'free');
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(user?.subscription_end_date || null);
  const [subscriptionId, setSubscriptionId] = useState(user?.subscription_id || null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setStatus('free');
      setSubscriptionEndDate(null);
      setSubscriptionId(null);
      setCancelAtPeriodEnd(false);
      setIsTrialing(false);
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      setStatus(data.status || 'free');
      setSubscriptionEndDate(data.subscriptionEndDate || null);
      setSubscriptionId(data.subscriptionId || null);
      setCancelAtPeriodEnd(Boolean(data.cancelAtPeriodEnd));
      setIsTrialing(Boolean(data.isTrialing));
      if (refreshUser) await refreshUser();
      return data;
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    if (!user) {
      setStatus('free');
      setSubscriptionEndDate(null);
      setSubscriptionId(null);
      setCancelAtPeriodEnd(false);
      setIsTrialing(false);
      return;
    }
    setStatus(user.subscription_status || 'free');
    setSubscriptionEndDate(user.subscription_end_date || null);
    setSubscriptionId(user.subscription_id || null);
    setCancelAtPeriodEnd(false);
    setIsTrialing(false);
  }, [user]);

  const isPremium = status === 'active'
    || (status === 'cancelled' && !!subscriptionEndDate && new Date(subscriptionEndDate) > new Date());

  return {
    isPremium,
    status,
    subscriptionEndDate,
    subscriptionId,
    cancelAtPeriodEnd,
    isTrialing,
    loading,
    refresh: fetchStatus,
  };
}
