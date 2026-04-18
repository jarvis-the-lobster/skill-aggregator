import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { apiService } from '../services/api';
import analytics from '../services/analytics';

function getNotificationLink(notification) {
  let data = notification.data;
  if (!data) return null;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (data.skillId) return `/skills/${data.skillId}/plan`;
  return null;
}

function timeAgo(dateStr) {
  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) return 'recently';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ isAuthenticated = true }) {
  const navigate = useNavigate();
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
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setOpen(false);
      return undefined;
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    const handleRefresh = () => fetchNotifications();
    window.addEventListener('notifications:refresh', handleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('notifications:refresh', handleRefresh);
    };
  }, [fetchNotifications, isAuthenticated]);

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
    if (!isAuthenticated) return;
    if (!open) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
      analytics.notificationBellOpened(unreadCount);
    }
    setOpen((prev) => !prev);
  }

  async function handleMarkRead(id) {
    if (!isAuthenticated) return;
    await apiService.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    analytics.notificationMarkedRead(id);
  }

  async function handleMarkAllRead() {
    if (!isAuthenticated) return;
    await apiService.markAllNotificationsRead();
    const markedCount = notifications.filter((n) => !n.read_at).length;
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
    analytics.notificationsMarkedAllRead(markedCount);
  }

  async function handleNotificationClick(n) {
    const link = getNotificationLink(n);
    if (!link) return;
    if (!n.read_at) {
      await handleMarkRead(n.id);
    }
    setOpen(false);
    navigate(link);
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
              notifications.map((n) => {
                const link = getNotificationLink(n);
                const content = (
                  <>
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
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMarkRead(n.id); }}
                        className="mt-0.5 flex-shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-teal"
                        title="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                );

                if (link) {
                  return (
                    <Link
                      key={n.id}
                      to={link}
                      onClick={() => handleNotificationClick(n)}
                      className={`flex items-start gap-3 border-b border-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.06] ${
                        n.read_at ? 'opacity-60' : 'bg-white/[0.02]'
                      }`}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 border-b border-white/[0.04] px-4 py-3 transition-colors ${
                      n.read_at ? 'opacity-60' : 'bg-white/[0.02]'
                    }`}
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
