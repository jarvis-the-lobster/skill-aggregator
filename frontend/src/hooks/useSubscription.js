import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function useSubscription() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState(user?.subscription_status || 'free');
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(user?.subscription_end_date || null);
  const [subscriptionId, setSubscriptionId] = useState(user?.subscription_id || null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setStatus('free');
      setSubscriptionEndDate(null);
      setSubscriptionId(null);
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
      return;
    }
    setStatus(user.subscription_status || 'free');
    setSubscriptionEndDate(user.subscription_end_date || null);
    setSubscriptionId(user.subscription_id || null);
  }, [user]);

  return {
    isPremium: status === 'active',
    status,
    subscriptionEndDate,
    subscriptionId,
    loading,
    refresh: fetchStatus,
  };
}
