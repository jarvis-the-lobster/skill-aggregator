import { Link } from 'react-router-dom';
import { useStreak } from '../hooks/useStreak';

export function StreakWidget() {
  const { streak, loading } = useStreak();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gray-200" />
          <div className="space-y-2">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="h-4 bg-gray-200 rounded w-56" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex flex-col items-center space-y-1">
              <div className="h-3 bg-gray-200 rounded w-6" />
              <div className="w-10 h-10 rounded-xl bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!streak) return null;

  const { currentStreak, freezeAvailable, freezeRechargesIn, weeklyCalendar, todayCompleted } = streak;
  const isNewUser = currentStreak === 0 && !streak.lastActivityDate;
  const streakBroken = currentStreak === 0 && !!streak.lastActivityDate && !todayCompleted;
  const freezeUsedThisWeek = weeklyCalendar.some(d => d.status === 'frozen');

  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-6 ${
      freezeUsedThisWeek ? 'border-cyan-200' :
      streakBroken ? 'border-2 border-red-200' :
      'border-gray-200'
    }`}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          {/* Fire badge */}
          <div className="relative">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              isNewUser || streakBroken
                ? 'bg-gray-200'
                : 'bg-gradient-to-br from-orange-400 to-red-500 streak-glow-pulse'
            }`}>
              <span className={`text-3xl inline-block ${
                isNewUser || streakBroken ? 'grayscale opacity-40' : 'streak-flame-animate'
              }`}>🔥</span>
            </div>
            <div className={`absolute -top-2 -right-2 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow-lg ${
              isNewUser || streakBroken ? 'bg-gray-400' : 'bg-primary-500'
            } ${todayCompleted ? 'streak-pop' : ''}`}>
              {currentStreak}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {isNewUser ? 'Start your learning streak' :
               streakBroken ? `${streak.longestStreak}-day streak lost` :
               todayCompleted ? `${currentStreak}-day streak! 🎉` :
               freezeUsedThisWeek ? 'Streak saved! ❄️' :
               `${currentStreak}-day streak!`}
            </h3>
            <p className={`text-sm ${
              isNewUser ? 'text-gray-500' :
              streakBroken ? 'text-gray-400' :
              todayCompleted ? 'text-green-600 font-medium' :
              freezeUsedThisWeek ? 'text-gray-500' :
              'text-gray-500'
            }`}>
              {isNewUser ? 'Complete your first lesson to light the fire' :
               streakBroken ? 'No freeze available — your streak has been reset' :
               todayCompleted ? "Today's goal complete — see you tomorrow!" :
               freezeUsedThisWeek ? 'You missed a day — a freeze was used automatically' :
               "You're on fire! Keep it going 🚀"}
            </p>
          </div>
        </div>
        {/* Freeze indicator (not shown for new users) */}
        {!isNewUser && (
          <div className={`flex items-center space-x-2 text-sm ${
            freezeAvailable ? 'text-green-500' :
            streakBroken ? 'text-gray-400' :
            'text-orange-500'
          }`}>
            <span className={streakBroken && !freezeAvailable ? 'opacity-40' : ''}>❄️</span>
            <span>
              {freezeAvailable ? 'Freeze ready' :
               freezeRechargesIn != null ? (streakBroken ? `Recharges in ${freezeRechargesIn} days` : `0 freezes left`) :
               '0 freezes left'}
            </span>
          </div>
        )}
      </div>

      {/* Weekly calendar strip */}
      <div className="mb-4">
        {!isNewUser && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400 uppercase">This Week</span>
            <span className="text-xs text-gray-400">
              {weeklyCalendar[0] && `${formatShortDate(weeklyCalendar[0].date)} – ${formatShortDate(weeklyCalendar[6].date)}`}
            </span>
          </div>
        )}
        <div className="grid grid-cols-7 gap-2">
          {weeklyCalendar.map(day => (
            <div key={day.date} className="flex flex-col items-center space-y-1">
              <span className={`text-xs ${
                day.status === 'today' ? 'font-semibold text-orange-500' :
                day.status === 'completed' && day.date === todayStr() ? 'font-semibold text-green-500' :
                day.status === 'frozen' ? 'text-cyan-500 font-semibold' :
                day.status === 'missed' ? 'text-red-400 font-semibold' :
                'text-gray-400'
              }`}>
                {day.status === 'today' ? 'Today' :
                 day.status === 'completed' && day.date === todayStr() ? 'Today' :
                 day.status === 'frozen' ? 'Frozen' :
                 day.status === 'missed' ? 'Missed' :
                 day.dayOfWeek}
              </span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium ${getDayClasses(day, streakBroken)}`}>
                {day.dayNumber}
              </div>
              {day.status === 'completed' && <span className="text-xs text-green-500">✓</span>}
              {day.status === 'today' && <span className="text-xs text-orange-400">⏳</span>}
              {day.status === 'frozen' && <span className="text-xs text-cyan-500">❄️</span>}
              {day.status === 'missed' && <span className="text-xs text-red-400">✗</span>}
              {(day.status === 'empty' || day.status === 'future') && streakBroken && <span className="text-xs text-gray-300">·</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA area */}
      {isNewUser && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <span className="text-lg">🚀</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Pick a skill and start learning</p>
              <p className="text-xs text-gray-500">Your first day starts a brand new streak</p>
            </div>
          </div>
          <Link to="/" className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
            Browse Skills
          </Link>
        </div>
      )}

      {todayCompleted && !isNewUser && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <span className="text-lg">✅</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Day {currentStreak} complete!</p>
              <p className="text-xs text-green-600">You're making great progress — keep it up</p>
            </div>
          </div>
          <span className="text-2xl">🏆</span>
        </div>
      )}

      {!todayCompleted && !isNewUser && !streakBroken && !freezeUsedThisWeek && currentStreak > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <span className="text-lg">📖</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Continue your streak</p>
              <p className="text-xs text-gray-500">Complete today's lesson to keep your streak alive</p>
            </div>
          </div>
          <Link to="/my-courses" className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
            Start Today's Lesson
          </Link>
        </div>
      )}

      {!todayCompleted && !isNewUser && !streakBroken && !freezeUsedThisWeek && currentStreak === 0 && (
        <div className="bg-gradient-to-r from-primary-50 to-purple-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <span className="text-lg">🚀</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Start your streak</p>
              <p className="text-xs text-gray-500">Complete a lesson today to begin</p>
            </div>
          </div>
          <Link to="/my-courses" className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
            Let's Go
          </Link>
        </div>
      )}

      {freezeUsedThisWeek && !todayCompleted && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-lg">❄️</span>
            <div>
              <p className="text-sm font-medium text-cyan-800">
                {freezeRechargesIn != null ? `Freeze recharges in ${freezeRechargesIn} days` : 'Freeze used'}
              </p>
              <p className="text-xs text-cyan-600">
                Free: 1 freeze / week · <span className="font-semibold premium-upsell">Premium: 1 freeze / 48 hours</span>
              </p>
            </div>
          </div>
          <button className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors premium-upsell">
            Upgrade
          </button>
        </div>
      )}

      {streakBroken && (
        <>
          <div className="flex gap-3">
            <div className="flex-1 bg-gradient-to-r from-primary-50 to-purple-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-lg">💪</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Start a new streak</p>
                  <p className="text-xs text-gray-500">Complete today's lesson to begin again</p>
                </div>
              </div>
              <Link to="/my-courses" className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
                Let's Go
              </Link>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center space-x-3 mt-3 premium-upsell">
            <span className="text-lg">💡</span>
            <p className="text-xs text-amber-700">With <span className="font-semibold">Premium</span>, freezes recharge every 48 hours so you're always protected.</p>
          </div>
        </>
      )}
    </div>
  );
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getDayClasses(day, streakBroken) {
  switch (day.status) {
    case 'completed':
      if (day.date === todayStr()) {
        return 'streak-day-done text-white font-bold ring-2 ring-green-400 ring-offset-2';
      }
      return streakBroken
        ? 'bg-gray-200 text-gray-400'
        : 'streak-day-done text-white';
    case 'today':
      return streakBroken
        ? 'border-2 border-dashed border-orange-300 text-orange-400 font-bold'
        : 'streak-day-today text-white font-bold ring-2 ring-orange-300 ring-offset-2';
    case 'frozen':
      return 'streak-day-frozen text-white';
    case 'missed':
      return 'bg-red-100 border-2 border-dashed border-red-300 text-red-400';
    case 'future':
    case 'empty':
    default:
      return streakBroken
        ? 'bg-gray-200 text-gray-400'
        : 'bg-gray-100 text-gray-300';
  }
}
