'use client';

import { useEffect, useState } from 'react';
import { fetchApi, type PaginatedResponse, type Contract } from '../lib/api';
import { RelevanceBar } from '../components/relevance-bar';
import { Loading, ErrorMessage } from '../components/loading';

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days === null) return <span className="text-gray-400 text-xs">No deadline</span>;
  if (days < 0) return <span className="text-gray-400 text-xs">Expired</span>;

  const color = days <= 3 ? 'bg-red-100 text-red-800' : days <= 7 ? 'bg-orange-100 text-orange-800' : days <= 14 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';

  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{days}d left</span>;
}

export default function ContractsPage() {
  const [data, setData] = useState<PaginatedResponse<Contract> | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [upcoming, setUpcoming] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (upcoming) params.set('upcoming', 'true');
    params.set('page', String(page));

    fetchApi<PaginatedResponse<Contract>>(`/contracts?${params}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [search, upcoming, page]);

  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Contract Opportunities</h2>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={upcoming} onChange={(e) => { setUpcoming(e.target.checked); setPage(1); }} className="rounded" />
          Upcoming only
        </label>
        <input
          type="text"
          placeholder="Search contracts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
        />
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.data.map((c) => (
              <div key={c.id} className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-sm line-clamp-2 flex-1">{c.title}</h3>
                  <DeadlineBadge deadline={c.response_deadline} />
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mb-3">{c.description || 'No description'}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{c.agency || 'Unknown Agency'}</span>
                  <RelevanceBar score={c.relevance_score} />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  {c.naics_code && <span className="bg-gray-100 px-2 py-0.5 rounded">NAICS: {c.naics_code}</span>}
                  {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View on SAM.gov</a>}
                </div>
              </div>
            ))}
          </div>
          {data.data.length === 0 && (
            <p className="text-center text-gray-500 py-8">No contracts found. Run the SAM.gov collector to fetch data.</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{data.total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
              <span className="px-3 py-1 text-sm">Page {page}</span>
              <button onClick={() => setPage(page + 1)} disabled={data.data.length < data.pageSize} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
