import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import analytics from '../services/analytics';

export function RatingButtons({ contentId, skillId, initialCounts, initialUserRating = null }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState(initialCounts || { thumbs_up: 0, thumbs_down: 0 });
  const [userRating, setUserRating] = useState(initialUserRating ?? null);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleRate = async (rating) => {
    if (!user) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
      return;
    }

    // Clicking the active button removes the vote
    const newRating = userRating === rating ? null : rating;

    // Optimistic update
    const prevCounts = { ...counts };
    const prevRating = userRating;
    const updatedCounts = { ...counts };
    if (userRating) updatedCounts[userRating] = Math.max(0, (updatedCounts[userRating] || 0) - 1);
    if (newRating) updatedCounts[newRating] = (updatedCounts[newRating] || 0) + 1;

    setCounts(updatedCounts);
    setUserRating(newRating);

    try {
      const result = await apiService.rateContent(contentId, newRating);
      setCounts(result.counts);
      analytics.trackContentRated(contentId, skillId, newRating);
    } catch {
      // Revert on error
      setCounts(prevCounts);
      setUserRating(prevRating);
    }
  };

  return (
    <div className="relative flex items-center space-x-1">
      <button
        onClick={() => handleRate('thumbs_up')}
        className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
          userRating === 'thumbs_up'
            ? 'bg-green-100 text-green-700 font-medium'
            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
        }`}
        title="Helpful"
      >
        <span>👍</span>
        <span>{counts.thumbs_up || 0}</span>
      </button>

      <button
        onClick={() => handleRate('thumbs_down')}
        className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
          userRating === 'thumbs_down'
            ? 'bg-red-100 text-red-700 font-medium'
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
        }`}
        title="Not helpful"
      >
        <span>👎</span>
        <span>{counts.thumbs_down || 0}</span>
      </button>

      {showTooltip && (
        <span className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10">
          Sign in to rate
        </span>
      )}
    </div>
  );
}
