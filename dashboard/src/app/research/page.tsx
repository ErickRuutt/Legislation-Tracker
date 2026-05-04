'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchApi,
  uploadPdf,
  fetchIngestJob,
  type ResearchDocument,
  type ResearchOutput,
  type AskResult,
  type IngestJob,
} from '../lib/api';
import { Loading } from '../components/loading';

function formatDate(input?: string | null) {
  if (!input) return 'Unknown';
  return input.split('T')[0];
}

// ─── Upload Section ──────────────────────────────────────────

function UploadSection({ onUploaded }: { onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState<IngestJob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const next = await fetchIngestJob(jobId);
        setJob(next);

        if (next.status === 'success') {
          setProcessing(false);
          setStatus('Ingestion complete. Ready for questions.');
          if (pollRef.current) clearInterval(pollRef.current);
          onUploaded();
          return;
        }

        if (next.status === 'error') {
          setProcessing(false);
          setError(next.error || 'Ingestion failed.');
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        if (next.status === 'queued') {
          setStatus('Queued for processing. This can take a few minutes.');
        } else if (next.status === 'running') {
          setStatus('Extracting text and building embeddings...');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch job status.');
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted');
      return;
    }

    setUploading(true);
    setProcessing(false);
    setError('');
    setStatus('Uploading...');

    try {
      const result = await uploadPdf(file);
      setStatus('Upload complete. Processing queued.');
      setProcessing(true);
      setJob({
        id: result.jobId,
        status: result.status,
        documentId: null,
        error: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      startPolling(result.jobId);
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const statusTone =
    error
      ? 'border-red-200 text-red-700 bg-red-50'
      : 'border-[color:var(--every-peri-500)] text-[color:var(--ink-700)] bg-white/70';

  return (
    <div className="surface p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl">Upload Research PDF</h3>
        <p className="text-sm text-[color:var(--ink-500)]">
          Drop a PDF here. We extract, chunk, and index it in the background.
        </p>
      </div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
        className={`mt-6 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors bg-white/70 ${
          dragging
            ? 'border-[color:var(--every-blue)] bg-white'
            : 'border-[color:var(--every-sand-300)] hover:border-[color:var(--every-blue-200)]'
        }`}
      >
        {uploading || processing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--every-blue)]" />
            <p className="text-sm text-[color:var(--ink-500)]">{status}</p>
          </div>
        ) : (
          <>
            <p className="text-4xl mb-2 font-semibold text-[color:var(--every-blue)]">+</p>
            <p className="text-sm text-[color:var(--ink-500)]">
              Drag & drop a PDF, or click to browse
            </p>
            <p className="text-xs text-[color:var(--ink-500)] mt-1">PDF files only</p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {(status || error) && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${statusTone}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span>{error || status}</span>
            {job && (
              <span className="chip">
                {job.status}
                {job.retryCount > 0 ? ` · retry ${job.retryCount}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Document Library ────────────────────────────────────────

function DocumentLibrary({
  docs,
  loading,
  onRefresh,
}: {
  docs: ResearchDocument[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<{
    docId: string;
    markdown: string;
  } | null>(null);

  const handleSummarize = async (docId: string) => {
    setSummarizing(docId);
    try {
      const result = await fetchApi<AskResult>(
        `/research/documents/${docId}/summarize`,
        { method: 'POST' }
      );
      setSummaryView({ docId, markdown: result.markdown });
      onRefresh();
    } catch (err: any) {
      alert(`Summarize failed: ${err.message}`);
    } finally {
      setSummarizing(null);
    }
  };

  const handleViewSummary = async (docId: string) => {
    try {
      const result = await fetchApi<{ data: ResearchOutput[] }>(
        `/research/outputs/${docId}`
      );
      if (result.data.length > 0) {
        setSummaryView({ docId, markdown: result.data[0].response_markdown });
      }
    } catch {}
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its chunks/embeddings?`)) return;
    setDeleting(docId);
    try {
      await fetchApi(`/research/documents/${docId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const statusBadge = (doc: ResearchDocument) => {
    if (doc.summary_count > 0)
      return (
        <span className="chip text-[color:var(--every-blue)] border-[color:var(--every-blue-200)]">
          Summarized
        </span>
      );
    if (doc.embedding_count > 0)
      return (
        <span className="chip text-[color:var(--ink-700)] border-[color:var(--every-peri-500)]">
          Embedded
        </span>
      );
    return <span className="chip text-[color:var(--ink-500)]">Ingested</span>;
  };

  return (
    <div className="surface-flat p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl">Document Library</h3>
          <p className="text-sm text-[color:var(--ink-500)]">
            {docs.length} documents indexed for questions and summaries.
          </p>
        </div>
        <button onClick={onRefresh} className="btn-ghost text-sm">
          Refresh
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : docs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[color:var(--every-sand-300)] px-4 py-10 text-center text-sm text-[color:var(--ink-500)]">
          No documents yet. Upload a PDF above to get started.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <div key={doc.id} className="surface-flat p-5 transition-transform hover:-translate-y-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold leading-tight">
                    {doc.title}
                  </h4>
                  <p className="text-xs text-[color:var(--ink-500)] mt-1">
                    Uploaded {formatDate(doc.created_at)}
                  </p>
                </div>
                {statusBadge(doc)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="chip">{doc.page_count} pages</span>
                <span className="chip">{doc.chunk_count} chunks</span>
                <span className="chip">{doc.embedding_count} embeddings</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {doc.summary_count > 0 ? (
                  <button
                    onClick={() => handleViewSummary(doc.id)}
                    className="text-sm text-[color:var(--every-blue)] font-semibold"
                  >
                    View Summary
                  </button>
                ) : (
                  <button
                    onClick={() => handleSummarize(doc.id)}
                    disabled={summarizing === doc.id}
                    className="text-sm text-[color:var(--every-blue)] font-semibold disabled:opacity-50"
                  >
                    {summarizing === doc.id ? 'Summarizing...' : 'Summarize'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  disabled={deleting === doc.id}
                  className="text-sm text-red-600 font-semibold disabled:opacity-50"
                >
                  {deleting === doc.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {summaryView && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setSummaryView(null)}
        >
          <div
            className="surface w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-black/10">
              <h3 className="text-xl">Document Summary</h3>
              <button
                onClick={() => setSummaryView(null)}
                className="text-[color:var(--ink-500)] hover:text-[color:var(--ink-900)] text-xl"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto prose prose-sm max-w-none">
              <MarkdownContent content={summaryView.markdown} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ask Section ─────────────────────────────────────────────

function AskSection() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetchApi<AskResult>('/research/ask', {
        method: 'POST',
        body: JSON.stringify({ query: query.trim() }),
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl">Ask the Research Corpus</h3>
        <p className="text-sm text-[color:var(--ink-500)]">
          Query everything you have ingested. Answers include citations by page.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Ask a question across all ingested documents..."
          className="input flex-1"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !query.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </div>

      {loading && (
        <div className="mt-4">
          <Loading />
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 surface-flat p-5">
          <div className="prose prose-sm max-w-none">
            <MarkdownContent content={result.markdown} />
          </div>
          {result.citations?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {result.citations.map((citation, idx) => (
                <span key={`${citation.chunkId}-${idx}`} className="chip">
                  {citation.documentTitle} · p.{citation.pageNumber}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Simple Markdown Renderer ────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[color:var(--every-sand-100)] px-1 rounded text-sm">$1</code>')
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[color:var(--every-blue)] hover:underline">$1</a>')
    .replace(/\[D(\d+)\s+p\.(\d+)\]/g, '<span class="inline-block bg-[color:var(--every-peri-500)] text-[color:var(--ink-700)] text-xs px-1.5 py-0.5 rounded font-mono">[D$1 p.$2]</span>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^---$/gm, '<hr class="my-4 border-[color:var(--every-sand-200)]">')
    .replace(/^(?!<[a-z])((?!^\s*$).+)$/gm, '<p class="mb-2">$1</p>');

  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

  return html;
}

// ─── Main Page ───────────────────────────────────────────────

export default function ResearchPage() {
  const [docs, setDocs] = useState<ResearchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocs = useCallback(async () => {
    try {
      const result = await fetchApi<{ data: ResearchDocument[] }>(
        '/research/documents'
      );
      setDocs(result.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--ink-500)]">
          Research Console
        </p>
        <h2 className="text-4xl">PFAS Research Workspace</h2>
        <p className="text-sm text-[color:var(--ink-500)] max-w-2xl">
          Build a private corpus of PFAS science and policy, then ask questions with
          citations you can trust.
        </p>
      </header>

      <UploadSection onUploaded={loadDocs} />
      <DocumentLibrary docs={docs} loading={loading} onRefresh={loadDocs} />
      <AskSection />
    </div>
  );
}
