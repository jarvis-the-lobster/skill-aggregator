import { createContext, useState, useCallback, useEffect } from 'react';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';

export const StreakContext = createContext(null);

export function StreakProvider({ children }) {
  const { user } = useAuth();
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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
    refresh();
  }, [refresh]);

  return (
    <StreakContext.Provider value={{ streak, loading, refresh }}>
      {children}
    </StreakContext.Provider>
  );
}
