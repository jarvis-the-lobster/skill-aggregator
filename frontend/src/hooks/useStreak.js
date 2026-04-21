import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export const STREAK_REFRESH_EVENT = 'streak:refresh';

export function useStreak() {
  const { user } = useAuth();
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStreak = useCallback(async () => {
    if (!user) {
      setStreak(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiService.getStreak();
      setStreak(data);
    } catch {
      setStreak(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStreak();
  }, [fetchStreak]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchStreak();
    };

    window.addEventListener(STREAK_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(STREAK_REFRESH_EVENT, handleRefresh);
  }, [fetchStreak]);

  return { streak, loading, refresh: fetchStreak };
}
