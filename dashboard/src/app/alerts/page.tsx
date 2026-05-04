'use client';

import { useEffect, useState } from 'react';
import { fetchApi, type PaginatedResponse, type Alert, type AlertRule } from '../lib/api';
import { SeverityBadge } from '../components/severity-badge';
import { Loading, ErrorMessage } from '../components/loading';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PaginatedResponse<Alert> | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'alerts' | 'rules'>('alerts');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (tab === 'alerts') {
      const params = new URLSearchParams();
      if (filter) params.set('severity', filter);
      params.set('page', String(page));

      fetchApi<PaginatedResponse<Alert>>(`/alerts?${params}`)
        .then(setAlerts)
        .catch((e) => setError(e.message));
    } else {
      fetchApi<AlertRule[]>('/alerts/rules')
        .then(setRules)
        .catch((e) => setError(e.message));
    }
  }, [tab, filter, page]);

  const acknowledge = async (id: number) => {
    await fetchApi(`/alerts/${id}/acknowledge`, { method: 'PATCH' });
    setAlerts((prev) => prev ? {
      ...prev,
      data: prev.data.map((a) => a.id === id ? { ...a, acknowledged: 1 } : a),
    } : null);
  };

  const toggleRule = async (id: number, enabled: boolean) => {
    await fetchApi(`/alerts/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: enabled ? 1 : 0 } : r));
  };

  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Alerts</h2>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'alerts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Alert Feed
        </button>
        <button
          onClick={() => setTab('rules')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'rules' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Alert Rules
        </button>
      </div>

      {tab === 'alerts' && (
        <>
          <div className="flex gap-3">
            <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="border rounded-md px-3 py-1.5 text-sm bg-white">
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {!alerts ? <Loading /> : (
            <>
              <div className="space-y-2">
                {alerts.data.map((alert) => (
                  <div key={alert.id} className={`bg-white rounded-lg shadow-sm border p-4 ${alert.acknowledged ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={alert.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{alert.message}</p>
                        <p className="text-xs text-gray-400 mt-2">{new Date(alert.created_at).toLocaleString()}</p>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledge(alert.id)}
                          className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {alerts.data.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No alerts yet. Alerts will appear when collectors find matching data.</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{alerts.total} total</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
                  <span className="px-3 py-1 text-sm">Page {page}</span>
                  <button onClick={() => setPage(page + 1)} disabled={alerts.data.length < alerts.pageSize} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'rules' && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white rounded-lg shadow-sm border p-4 flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!rule.enabled}
                  onChange={(e) => toggleRule(rule.id, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
              <div className="flex-1">
                <p className="font-medium text-sm">{rule.name}</p>
                <p className="text-xs text-gray-500">Type: {rule.type}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
