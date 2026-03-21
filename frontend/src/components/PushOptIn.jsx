import { useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const DISMISSED_KEY = 'push-optin-dismissed';

export function PushOptIn({ streak }) {
  const { isSupported, isSubscribed, loading, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1'
  );

  // Show until user subscribes or dismisses
  const shouldShow =
    isSupported &&
    !isSubscribed &&
    !dismissed;

  if (!shouldShow) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function handleEnable() {
    const success = await requestPermission();
    if (success) handleDismiss();
  }

  return (
    <div className="bg-gradient-to-r from-primary-50 to-orange-50 border border-primary-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm font-medium text-gray-800">
        Want daily reminders to keep your streak going? <span aria-hidden="true">🔥</span>
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Enabling...' : 'Enable'}
        </button>
        <button
          onClick={handleDismiss}
          className="px-4 py-1.5 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
