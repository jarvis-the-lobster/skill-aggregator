import { useContext } from 'react';
import { StreakContext } from '../contexts/StreakContext';

export function useStreak() {
  const ctx = useContext(StreakContext);
  if (!ctx) {
    throw new Error('useStreak must be used within a StreakProvider');
  }
  return ctx;
}
