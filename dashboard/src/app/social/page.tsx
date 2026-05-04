'use client';

import { useEffect, useState } from 'react';
import { fetchApi, type PaginatedResponse, type SocialPost, type DailyStats } from '../lib/api';
import { RelevanceBar } from '../components/relevance-bar';
import { Loading, ErrorMessage } from '../components/loading';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SUBREDDITS = [
  'environment', 'Seattle', 'Portland', 'washington', 'oregon',
  'WaterTreatment', 'environmental_science', 'Tacoma', 'olympia', 'Eugene', 'Bellingham',
];

export default function SocialPage() {
  const [posts, setPosts] = useState<PaginatedResponse<SocialPost> | null>(null);
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [error, setError] = useState('');
  const [subreddit, setSub] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subreddit) params.set('subreddit', subreddit);
    if (search) params.set('search', search);
    params.set('page', String(page));

    fetchApi<PaginatedResponse<SocialPost>>(`/social/posts?${params}`)
      .then(setPosts)
      .catch((e) => setError(e.message));
  }, [subreddit, search, page]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subreddit) params.set('subreddit', subreddit);
    params.set('days', '30');

    fetchApi<DailyStats[]>(`/social/stats?${params}`)
      .then(setStats)
      .catch(() => {});
  }, [subreddit]);

  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Social Listening</h2>

      <div className="flex flex-wrap gap-3">
        <select value={subreddit} onChange={(e) => { setSub(e.target.value); setPage(1); }} className="border rounded-md px-3 py-1.5 text-sm bg-white">
          <option value="">All Subreddits</option>
          {SUBREDDITS.map((s) => (
            <option key={s} value={s}>r/{s}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search posts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
        />
      </div>

      {stats.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="font-semibold mb-3">Post Volume (30 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="post_count" stroke="#3b82f6" fill="#93c5fd" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {!posts ? <Loading /> : (
        <>
          <div className="space-y-3">
            {posts.data.map((post) => (
              <div key={post.id} className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="text-center text-xs text-gray-500 w-12 shrink-0">
                    <p className="font-bold text-lg text-gray-700">{post.score}</p>
                    <p>pts</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <a href={post.url || '#'} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline line-clamp-1">
                      {post.title || 'No title'}
                    </a>
                    {post.body && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{post.body}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">r/{post.subreddit}</span>
                      <span>u/{post.author}</span>
                      <span>{post.num_comments} comments</span>
                      <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                  <RelevanceBar score={post.relevance_score} />
                </div>
              </div>
            ))}
            {posts.data.length === 0 && (
              <p className="text-center text-gray-500 py-8">No social posts found. Run the Reddit collector to fetch data.</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{posts.total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
              <span className="px-3 py-1 text-sm">Page {page}</span>
              <button onClick={() => setPage(page + 1)} disabled={posts.data.length < posts.pageSize} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
