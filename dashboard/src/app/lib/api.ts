const BASE = '/api';

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Overview {
  totalBills: number;
  activeBills: number;
  totalContracts: number;
  upcomingDeadlines: number;
  totalArticles: number;
  recentArticles: number;
  totalSocialPosts: number;
  unresolvedAlerts: number;
  recentAlerts: Alert[];
  recentActivity: CollectorRun[];
}

export interface Legislation {
  id: number;
  source: string;
  bill_number: string;
  title: string;
  status: string;
  chamber: string | null;
  sponsor: string | null;
  introduced_date: string | null;
  last_action_date: string | null;
  url: string | null;
  relevance_score: number;
  keywords_matched: string | null;
  updated_at: string;
}

export interface Contract {
  id: number;
  notice_id: string;
  title: string;
  description: string | null;
  agency: string | null;
  naics_code: string | null;
  response_deadline: string | null;
  posted_date: string | null;
  url: string | null;
  relevance_score: number;
}

export interface Article {
  id: number;
  source: string;
  title: string;
  description: string | null;
  summary_text?: string | null;
  tags_json?: string | null;
  is_favorite?: number;
  url: string;
  published_at: string | null;
  region: string | null;
  relevance_score: number;
}

export interface ArticleDetail {
  article: Article;
  notes: Array<{ id: string; note_text: string; created_at: string }>;
}

export interface SocialPost {
  id: number;
  subreddit: string | null;
  author: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  score: number;
  num_comments: number;
  relevance_score: number;
  posted_at: string | null;
}

export interface Alert {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  acknowledged: number;
  created_at: string;
}

export interface AlertRule {
  id: number;
  name: string;
  type: string;
  conditions: string;
  enabled: number;
}

export interface CollectorRun {
  id: number;
  collector: string;
  status: string;
  items_found: number;
  items_new: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface DailyStats {
  date: string;
  post_count: number;
  comment_count: number;
  avg_score: number;
}

// Research types

export interface ResearchDocument {
  id: string;
  title: string;
  source_url: string | null;
  source_type: string;
  page_count: number;
  sha256: string;
  created_at: string;
  chunk_count: number;
  embedding_count: number;
  summary_count: number;
}

export interface ResearchOutput {
  id: string;
  output_type: string;
  prompt: string;
  response_markdown: string;
  metadata_json: string;
  created_at: string;
}

export interface AskResult {
  outputId: string;
  markdown: string;
  citations: Array<{
    label: string;
    documentId: string;
    documentTitle: string;
    chunkId: string;
    pageNumber: number;
    sourceUrl: string | null;
  }>;
}

export type IngestJobStatus = 'queued' | 'running' | 'success' | 'error';

export interface IngestJob {
  id: string;
  status: IngestJobStatus;
  documentId: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function uploadPdf(
  file: File,
  title?: string
): Promise<{ jobId: string; status: IngestJobStatus }> {
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);

  const res = await fetch('/api/research/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function getArticleDetail(id: number): Promise<ArticleDetail> {
  return fetchApi<ArticleDetail>(`/articles/${id}`);
}

export async function setArticleFavorite(id: number, isFavorite: boolean): Promise<void> {
  await fetchApi(`/articles/${id}/favorite`, {
    method: 'PATCH',
    body: JSON.stringify({ isFavorite }),
  });
}

export async function updateArticleTags(id: number, tags: string[]): Promise<void> {
  await fetchApi(`/articles/${id}/tags`, {
    method: 'PATCH',
    body: JSON.stringify({ tags }),
  });
}

export async function addArticleNote(id: number, note: string): Promise<void> {
  await fetchApi(`/articles/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function fetchIngestJob(jobId: string): Promise<IngestJob> {
  return fetchApi<IngestJob>(`/research/uploads/${jobId}`);
}
