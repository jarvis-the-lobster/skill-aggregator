import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { apiService } from '../services/api';

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiService.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    const handleRefresh = () => fetchNotifications();
    window.addEventListener('notifications:refresh', handleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('notifications:refresh', handleRefresh);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleToggle() {
    if (!open) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
    setOpen((prev) => !prev);
  }

  async function handleMarkRead(id) {
    await apiService.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function handleMarkAllRead() {
    await apiService.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-100"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal px-1 text-[10px] font-bold text-dark-bg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-white/[0.1] bg-dark-card shadow-2xl z-[1100]">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <span className="text-sm font-semibold text-slate-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-teal hover:text-teal-light transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-white/[0.04] px-4 py-3 transition-colors ${
                    n.read_at ? 'opacity-60' : 'bg-white/[0.02]'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0 rounded-full bg-teal/20 p-1.5">
                    <Bell className="h-3.5 w-3.5 text-teal" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 leading-snug">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{n.body}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="mt-0.5 flex-shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-teal"
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
