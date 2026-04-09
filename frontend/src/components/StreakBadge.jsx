import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStreak } from '../hooks/useStreak';

function getTimeUntilMidnight() {
  const now = new Date();
  // Midnight Pacific — approximate using local time
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function StreakBadge({ compact = false }) {
  const { streak, loading } = useStreak();
  const [timeLeft, setTimeLeft] = useState(getTimeUntilMidnight());

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeUntilMidnight()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !streak) return null;

  const { currentStreak, freezeAvailable, freezeRechargesIn } = streak;
  const freezeUsedThisWeek = streak.weeklyCalendar?.some(d => d.status === 'frozen');
  const isNewUser = currentStreak === 0 && !streak.lastActivityDate;

  if (compact) {
    const compactBg = freezeUsedThisWeek && !streak.todayCompleted
      ? 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100'
      : !streak.todayCompleted && currentStreak > 0
        ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
        : 'bg-white border-gray-200 hover:bg-gray-50';

    const compactMeta = isNewUser
      ? 'Start'
      : !streak.todayCompleted && currentStreak > 0
        ? timeLeft
        : freezeAvailable
          ? 'Ready'
          : `${freezeRechargesIn ?? 0}d`;

    return (
      <Link to="/my-courses" className={`inline-flex items-center space-x-2 rounded-xl border px-3 py-2 shadow-sm transition-colors ${compactBg}`}>
        <span className={`text-base inline-block ${currentStreak > 0 ? 'streak-flame-animate' : ''}`}>🔥</span>
        <span className="text-sm font-bold text-gray-900">{isNewUser ? '0' : currentStreak}</span>
        <span className="text-xs text-gray-500">{compactMeta}</span>
      </Link>
    );
  }

  // No streak
  if (isNewUser) {
    return (
      <Link to="/my-courses" className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
        <span className="text-lg inline-block">🔥</span>
        <span className="text-sm text-gray-600">Start a streak</span>
      </Link>
    );
  }

  // Freeze was used — cyan style
  if (freezeUsedThisWeek && !streak.todayCompleted) {
    return (
      <Link to="/my-courses" className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 shadow-sm hover:bg-cyan-100 transition-colors">
        <span className="text-lg streak-flame-animate inline-block">🔥</span>
        <span className="text-base font-bold text-gray-900">{currentStreak}</span>
        <span className="text-sm text-cyan-600 font-medium">saved ❄️</span>
        <div className="w-px h-5 bg-cyan-200" />
        <span className="text-xs text-orange-400">❄️ {freezeRechargesIn}d</span>
      </Link>
    );
  }

  // Today not completed — show countdown
  if (!streak.todayCompleted && currentStreak > 0) {
    return (
      <Link to="/my-courses" className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 shadow-sm hover:bg-orange-100 transition-colors">
        <span className="text-lg streak-flame-animate inline-block">🔥</span>
        <span className="text-base font-bold text-gray-900">{currentStreak}</span>
        <div className="w-px h-5 bg-orange-200" />
        <span className="text-xs text-orange-500">⏳ {timeLeft}</span>
      </Link>
    );
  }

  // Active streak — today completed
  return (
    <Link to="/my-courses" className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
      <span className={`text-lg inline-block ${currentStreak > 0 ? 'streak-flame-animate' : ''}`}>🔥</span>
      <span className="text-base font-bold text-gray-900">{currentStreak}</span>
      <span className="text-sm text-gray-500">day streak</span>
      <div className="w-px h-5 bg-gray-200" />
      {freezeAvailable ? (
        <span className="text-xs text-green-500">❄️ ready</span>
      ) : (
        <span className="text-xs text-orange-400">❄️ {freezeRechargesIn ?? 0}d</span>
      )}
    </Link>
  );
}
