import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function StatusBadge({ status }) {
  const colors = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    quota_exceeded: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status || '—'}
    </span>
  );
}

function QuotaBar({ used, limit, percentUsed }) {
  const color = percentUsed > 80 ? 'bg-red-500' : percentUsed > 50 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{used.toLocaleString()} / {limit.toLocaleString()} units</span>
        <span>{percentUsed}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${Math.min(percentUsed, 100)}%` }} />
      </div>
    </div>
  );
}

export function AdminPage() {
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [metricsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/admin/metrics`, { headers }),
        fetch(`${API_BASE}/admin/users`, { headers }),
      ]);
      if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
      const data = await metricsRes.json();
      setMetrics(data);
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading metrics...</div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-4">
        <div className="text-red-600">Error: {error}</div>
        <button onClick={fetchMetrics} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          Retry
        </button>
      </div>
    );
  }

  const { scrapeStats, skillHealth, youtubeQuota, recentErrors, contentCounts } = metrics;

  // Build a lookup for content counts by skill_id + type
  const contentBySkill = {};
  for (const row of contentCounts) {
    if (!contentBySkill[row.skill_id]) contentBySkill[row.skill_id] = {};
    contentBySkill[row.skill_id][row.type] = row.count;
  }

  // Deduplicate source rows from scrapeStats
  const sourceMap = {};
  for (const row of scrapeStats) {
    sourceMap[row.source] = row;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ops Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'} · auto-refreshes every 60s
            </p>
          </div>
          <button
            onClick={fetchMetrics}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Refresh Now
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Total Users</p>
            <p className="text-3xl font-bold text-gray-900">{users ? users.length.toLocaleString() : '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* YouTube Quota */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">YouTube Quota Today</h2>
            <QuotaBar
              used={youtubeQuota.used}
              limit={youtubeQuota.limit}
              percentUsed={youtubeQuota.percentUsed}
            />
            <p className="text-xs text-gray-400 mt-2">Daily limit: 10,000 units. Resets at midnight PT.</p>
          </div>

          {/* Scrape Stats (last 7 days) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Scrape Stats — Last 7 Days</h2>
            {scrapeStats.length === 0 ? (
              <p className="text-gray-400 text-sm">No scrape data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium text-green-700">OK</th>
                    <th className="pb-2 font-medium text-red-700">Err</th>
                    <th className="pb-2 font-medium text-yellow-700">Quota</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(sourceMap).map(row => (
                    <tr key={row.source} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 font-mono text-xs text-gray-700">{row.source}</td>
                      <td className="py-2 text-green-700 font-medium">{row.success || 0}</td>
                      <td className="py-2 text-red-700 font-medium">{row.error || 0}</td>
                      <td className="py-2 text-yellow-700 font-medium">{row.quota_exceeded || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Skill Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Skill Health</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Skill</th>
                  <th className="pb-2 font-medium">Last Scraped</th>
                  <th className="pb-2 font-medium">Last Status</th>
                  <th className="pb-2 font-medium">Content</th>
                  <th className="pb-2 font-medium">Videos</th>
                  <th className="pb-2 font-medium">Articles</th>
                </tr>
              </thead>
              <tbody>
                {skillHealth.map(skill => (
                  <tr key={skill.skill_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-900">{skill.name}</td>
                    <td className="py-2 text-gray-500 text-xs">
                      {skill.last_scraped_at
                        ? new Date(skill.last_scraped_at).toLocaleString()
                        : <span className="text-gray-300">never</span>}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={skill.last_scrape_status} />
                    </td>
                    <td className="py-2 text-gray-700 font-medium">{skill.content_count}</td>
                    <td className="py-2 text-gray-500">{contentBySkill[skill.skill_id]?.video || 0}</td>
                    <td className="py-2 text-gray-500">{contentBySkill[skill.skill_id]?.article || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Users</h2>
          {!users ? (
            <p className="text-gray-400 text-sm">No user data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium w-10">#</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr key={user.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 text-gray-700">{user.email}</td>
                      <td className="py-2 text-gray-500">{user.display_name || '—'}</td>
                      <td className="py-2 text-gray-400 text-xs">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Errors</h2>
          {recentErrors.length === 0 ? (
            <p className="text-green-600 text-sm">No recent errors.</p>
          ) : (
            <div className="space-y-3">
              {recentErrors.map((err, i) => (
                <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{err.source}</span>
                    <span className="text-gray-600 font-medium">{err.skill_id}</span>
                    <span className="text-gray-400 text-xs ml-auto">{new Date(err.scraped_at).toLocaleString()}</span>
                  </div>
                  <p className="text-red-700 text-xs">{err.error_message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
