import { useStreak } from '../hooks/useStreak';

export function StreakBadge() {
  const { streak, loading } = useStreak();

  if (loading || !streak) return null;

  const { currentStreak, freezeAvailable, freezeRechargesIn } = streak;
  const freezeUsedThisWeek = streak.weeklyCalendar?.some(d => d.status === 'frozen');
  const isNewUser = currentStreak === 0 && !streak.lastActivityDate;

  // No streak — minimal display
  if (isNewUser) {
    return (
      <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm">
        <span className="text-lg inline-block opacity-30">🔥</span>
        <span className="text-sm text-gray-400">Start a streak</span>
      </div>
    );
  }

  // Freeze was used — cyan style
  if (freezeUsedThisWeek && !streak.todayCompleted) {
    return (
      <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 shadow-sm">
        <span className="text-lg streak-flame-animate inline-block">🔥</span>
        <span className="text-base font-bold text-gray-900">{currentStreak}</span>
        <span className="text-sm text-cyan-600 font-medium">saved ❄️</span>
        <div className="w-px h-5 bg-cyan-200" />
        <span className="text-xs text-orange-400">❄️ {freezeRechargesIn}d</span>
      </div>
    );
  }

  // Active streak
  return (
    <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm">
      <span className={`text-lg inline-block ${currentStreak > 0 ? 'streak-flame-animate' : 'opacity-30'}`}>🔥</span>
      <span className="text-base font-bold text-gray-900">{currentStreak}</span>
      <span className="text-sm text-gray-500">day streak</span>
      <div className="w-px h-5 bg-gray-200" />
      {freezeAvailable ? (
        <span className="text-xs text-green-500">❄️ ready</span>
      ) : (
        <span className="text-xs text-orange-400">❄️ {freezeRechargesIn ?? 0}d</span>
      )}
    </div>
  );
}
