'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchApi,
  type PaginatedResponse,
  type Article,
  getArticleDetail,
  setArticleFavorite,
  updateArticleTags,
  addArticleNote,
  type ArticleDetail,
} from '../lib/api';
import { RelevanceBar } from '../components/relevance-bar';
import { Loading, ErrorMessage } from '../components/loading';

function formatDate(date?: string | null) {
  if (!date) return 'Unknown';
  return date.split('T')[0];
}

export default function NewsPage() {
  const [data, setData] = useState<PaginatedResponse<Article> | null>(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ArticleDetail | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');

  const loadArticles = async () => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (favoriteOnly) params.set('favorite', 'true');
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('pageSize', '20');

    const result = await fetchApi<PaginatedResponse<Article>>(`/articles?${params}`);
    setData(result);
  };

  useEffect(() => {
    loadArticles().catch((e) => setError(e.message));
  }, [region, search, favoriteOnly, page]);

  const refreshRss = async () => {
    setRefreshing(true);
    setError('');
    try {
      await fetchApi('/collectors/run/google_news', { method: 'POST' });
      await fetchApi('/collectors/run/newsapi', { method: 'POST' }).catch(() => {});
      setPage(1);
      await loadArticles();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const openDrawer = async (articleId: number) => {
    const detail = await getArticleDetail(articleId);
    setSelected(detail);
    setNotesDraft('');
    const tags = safeTags(detail.article.tags_json);
    setTagsDraft(tags.join(', '));
    setDrawerOpen(true);
  };

  const toggleFavorite = async (article: Article) => {
    const next = !(article.is_favorite === 1);
    await setArticleFavorite(article.id, next);
    await loadArticles();
    if (selected?.article.id === article.id) {
      const detail = await getArticleDetail(article.id);
      setSelected(detail);
    }
  };

  const saveTags = async () => {
    if (!selected) return;
    const tags = tagsDraft
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await updateArticleTags(selected.article.id, tags);
    const detail = await getArticleDetail(selected.article.id);
    setSelected(detail);
  };

  const addNote = async () => {
    if (!selected || !notesDraft.trim()) return;
    await addArticleNote(selected.article.id, notesDraft.trim());
    const detail = await getArticleDetail(selected.article.id);
    setSelected(detail);
    setNotesDraft('');
  };

  const tagsPreview = useMemo(() => {
    if (!selected) return [] as string[];
    return safeTags(selected.article.tags_json);
  }, [selected]);

  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">News Feed</h2>
        <button
          onClick={refreshRss}
          disabled={refreshing}
          className="btn-ghost text-sm"
        >
          {refreshing ? 'Refreshing...' : 'Refresh RSS'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }} className="input text-sm bg-white">
          <option value="">All Regions</option>
          <option value="WA">Washington</option>
          <option value="OR">Oregon</option>
          <option value="PNW">Pacific Northwest</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search news..."
          className="input text-sm flex-1 min-w-[220px]"
        />
        <label className="flex items-center gap-2 text-sm text-[color:var(--ink-700)]">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(e) => { setFavoriteOnly(e.target.checked); setPage(1); }}
          />
          Favorites only
        </label>
      </div>

      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          {data.data.map((article) => (
            <div key={article.id} className="surface-flat p-4 hover:-translate-y-0.5 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <button
                    onClick={() => openDrawer(article.id)}
                    className="text-left"
                  >
                    <h3 className="font-semibold text-lg leading-snug">{article.title}</h3>
                  </button>
                  <p className="text-sm text-[color:var(--ink-500)] mt-1">
                    {article.source} · {formatDate(article.published_at)} · {article.region || 'National'}
                  </p>
                </div>
                <button
                  onClick={() => toggleFavorite(article)}
                  className={`text-sm font-semibold ${article.is_favorite === 1 ? 'text-[color:var(--every-blue)]' : 'text-gray-400'}`}
                >
                  {article.is_favorite === 1 ? '★' : '☆'}
                </button>
              </div>
              {article.description && (
                <p className="text-sm text-[color:var(--ink-700)] mt-2 line-clamp-2">
                  {article.description}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <RelevanceBar score={article.relevance_score} />
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[color:var(--every-blue)] hover:underline"
                >
                  Open source
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {data.page} of {Math.ceil(data.total / data.pageSize)}</span>
          <div className="space-x-2">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-semibold">{selected.article.title}</h3>
              <button onClick={() => setDrawerOpen(false)} className="text-xl text-gray-400">×</button>
            </div>

            <p className="text-xs text-[color:var(--ink-500)] mt-2">
              {selected.article.source} · {formatDate(selected.article.published_at)} · {selected.article.region || 'National'}
            </p>

            <div className="mt-4">
              <h4 className="text-sm font-semibold">Summary</h4>
              <p className="text-sm text-[color:var(--ink-700)] mt-2">
                {selected.article.summary_text || selected.article.description || 'No summary available yet.'}
              </p>
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-semibold">Tags</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {tagsPreview.length === 0 ? (
                  <span className="text-xs text-gray-400">No tags yet</span>
                ) : (
                  tagsPreview.map((tag) => (
                    <span key={tag} className="chip">{tag}</span>
                  ))
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  placeholder="Comma-separated tags"
                  className="input text-sm flex-1"
                />
                <button onClick={saveTags} className="btn-ghost text-sm">Save</button>
              </div>
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-semibold">Notes</h4>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add a note..."
                rows={3}
                className="input text-sm w-full mt-2"
              />
              <button onClick={addNote} className="btn-primary mt-3">Add Note</button>
              <div className="mt-4 space-y-3">
                {selected.notes.length === 0 ? (
                  <p className="text-xs text-gray-400">No notes yet.</p>
                ) : (
                  selected.notes.map((note) => (
                    <div key={note.id} className="surface-flat p-3">
                      <p className="text-sm text-[color:var(--ink-700)]">{note.note_text}</p>
                      <p className="text-xs text-gray-400 mt-2">{formatDate(note.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function safeTags(input?: string | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
