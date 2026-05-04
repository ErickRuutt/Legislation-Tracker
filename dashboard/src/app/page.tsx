'use client';

import { useEffect, useState } from 'react';
import { fetchApi, type Overview } from './lib/api';
import { StatCard } from './components/stat-card';
import { SeverityBadge } from './components/severity-badge';
import { Loading, ErrorMessage } from './components/loading';

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi<Overview>('/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Bills" value={data.activeBills} sub={`${data.totalBills} total tracked`} color="blue" />
        <StatCard label="Contracts" value={data.totalContracts} sub={`${data.upcomingDeadlines} upcoming deadlines`} color="green" />
        <StatCard label="News Articles" value={data.totalArticles} sub={`${data.recentArticles} in last 24h`} color="purple" />
        <StatCard label="Unresolved Alerts" value={data.unresolvedAlerts} sub={`${data.totalSocialPosts} social posts`} color={data.unresolvedAlerts > 0 ? 'red' : 'slate'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="font-semibold mb-3">Recent Alerts</h3>
          {data.recentAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">No alerts yet. Collectors will generate alerts when data matches your rules.</p>
          ) : (
            <div className="space-y-2">
              {data.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <p className="text-xs text-gray-500">{new Date(alert.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="font-semibold mb-3">Recent Collector Activity</h3>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500">No collector runs yet. Start the backend to begin collecting data.</p>
          ) : (
            <div className="space-y-2">
              {data.recentActivity.map((run) => (
                <div key={run.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                  <span className={`w-2 h-2 rounded-full ${
                    run.status === 'success' ? 'bg-green-500' :
                    run.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{run.collector}</p>
                    <p className="text-xs text-gray-500">
                      {run.items_new} new / {run.items_found} found
                      {' | '}
                      {new Date(run.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
