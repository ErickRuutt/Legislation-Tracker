import crypto from 'crypto';
import { getDb } from '../db/connection';

export type IngestJobStatus = 'queued' | 'running' | 'success' | 'error';

export interface IngestJob {
  id: string;
  status: IngestJobStatus;
  document_id: string | null;
  file_path: string;
  title: string;
  source_url: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export function createIngestJob(params: {
  filePath: string;
  title: string;
  sourceUrl?: string;
}): string {
  const db = getDb();
  const jobId = crypto.randomUUID();
  db.prepare(
    `
      INSERT INTO research_ingest_jobs (id, status, file_path, title, source_url)
      VALUES (?, 'queued', ?, ?, ?)
    `
  ).run(jobId, params.filePath, params.title, params.sourceUrl || null);
  return jobId;
}

export function getIngestJob(jobId: string): IngestJob | null {
  const db = getDb();
  const job = db
    .prepare('SELECT * FROM research_ingest_jobs WHERE id = ?')
    .get(jobId) as IngestJob | undefined;
  return job || null;
}

export function updateIngestJob(jobId: string, updates: {
  status?: IngestJobStatus;
  documentId?: string | null;
  errorMessage?: string | null;
}): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.documentId !== undefined) {
    fields.push('document_id = ?');
    values.push(updates.documentId);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(jobId);

  db.prepare(`UPDATE research_ingest_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function incrementRetry(jobId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE research_ingest_jobs SET retry_count = retry_count + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(jobId);
}
