'use client';

import { useEffect, useState } from 'react';
import { fetchApi, type PaginatedResponse, type Legislation } from '../lib/api';
import { RelevanceBar } from '../components/relevance-bar';
import { Loading, ErrorMessage } from '../components/loading';

export default function LegislationPage() {
  const [data, setData] = useState<PaginatedResponse<Legislation> | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Legislation | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    params.set('page', String(page));

    fetchApi<PaginatedResponse<Legislation>>(`/legislation?${params}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [source, status, search, page]);

  const loadDetail = async (bill: Legislation) => {
    setSelected(bill);
    try {
      const detail = await fetchApi<any>(`/legislation/${bill.id}`);
      setHistory(detail.history || []);
    } catch {}
  };

  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Legislation Tracker</h2>

      <div className="flex flex-wrap gap-3">
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="border rounded-md px-3 py-1.5 text-sm bg-white">
          <option value="">All Sources</option>
          <option value="congress">Congress</option>
          <option value="wa_legislature">WA Legislature</option>
          <option value="or_legislature">OR Legislature</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border rounded-md px-3 py-1.5 text-sm bg-white">
          <option value="">All Statuses</option>
          <option value="introduced">Introduced</option>
          <option value="in_committee">In Committee</option>
          <option value="passed_committee">Passed Committee</option>
          <option value="passed_chamber">Passed Chamber</option>
          <option value="signed">Signed</option>
        </select>
        <input
          type="text"
          placeholder="Search bills..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
        />
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Bill</th>
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Source</th>
                  <th className="text-left px-4 py-3 font-medium">Relevance</th>
                  <th className="text-left px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => loadDetail(bill)}>
                    <td className="px-4 py-3 font-mono text-blue-600">{bill.bill_number}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{bill.title}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{bill.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{bill.source}</td>
                    <td className="px-4 py-3"><RelevanceBar score={bill.relevance_score} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{bill.updated_at?.split('T')[0]}</td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No legislation found. Run the Congress collector to fetch data.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{data.total} total results</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
              <span className="px-3 py-1 text-sm">Page {page}</span>
              <button onClick={() => setPage(page + 1)} disabled={data.data.length < data.pageSize} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-mono text-blue-600 text-sm">{selected.bill_number}</p>
                <h3 className="text-lg font-semibold mt-1">{selected.title}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Status:</span> {selected.status}</p>
              <p><span className="text-gray-500">Chamber:</span> {selected.chamber || 'N/A'}</p>
              <p><span className="text-gray-500">Sponsor:</span> {selected.sponsor || 'N/A'}</p>
              <p><span className="text-gray-500">Introduced:</span> {selected.introduced_date || 'N/A'}</p>
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block">View on source site</a>
              )}
            </div>
            {history.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="font-medium mb-2">Status History</h4>
                <div className="space-y-2">
                  {history.map((h: any) => (
                    <div key={h.id} className="flex gap-3 text-sm">
                      <span className="text-gray-400 w-24 shrink-0">{h.action_date || 'N/A'}</span>
                      <div>
                        <span className="font-medium">{h.status}</span>
                        {h.description && <p className="text-gray-500 text-xs">{h.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
