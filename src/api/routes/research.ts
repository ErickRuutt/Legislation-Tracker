import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../../db/connection';
import { generateDocumentSummary, answerQuestionWithCitations } from '../../research/generate';
import { logger } from '../../shared/logger';
import { createIngestJob, getIngestJob } from '../../research/ingest-jobs';
import { spawnIngestWorker } from '../../research/ingest-worker-client';

const router = Router();

// Disk storage — avoids holding large PDFs in Node's heap
const upload = multer({
  dest: path.join(os.tmpdir(), 'pfas-uploads'),
  limits: { fileSize: 300 * 1024 * 1024 },
});

async function handleUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const originalName = path.basename(req.file.originalname);
    const title = (req.body.title as string) || originalName.replace(/\.pdf$/i, '');
    const sourceUrl = req.body.sourceUrl as string | undefined;
    logger.info(`Upload received: ${originalName} (${req.file.size} bytes)`);

    // Rename temp file to include original name (so stored PDF gets a readable filename)
    const tempDir = path.dirname(req.file.path);
    const renamedPath = path.join(tempDir, originalName);
    fs.renameSync(req.file.path, renamedPath);

    const jobId = createIngestJob({
      filePath: renamedPath,
      title,
      sourceUrl,
    });

    spawnIngestWorker({
      jobId,
      filePath: renamedPath,
      title,
      sourceUrl,
    });

    logger.info(`Ingest job queued: ${jobId}`);
    res.status(202).json({ jobId, status: 'queued' });
  } catch (err: any) {
    // Clean up temp file on error
    if (req.file) {
      const tempDir = path.dirname(req.file.path);
      const renamedPath = path.join(tempDir, path.basename(req.file.originalname));
      fs.unlink(renamedPath, () => {});
      fs.unlink(req.file.path, () => {});
    }
    logger.error(`Upload failed: ${err?.message || err}`);
    res.status(500).json({ error: err?.message || 'Upload failed' });
  }
}

// POST /api/research/upload — upload PDF, ingest, and auto-embed
router.post('/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      logger.error(`Upload middleware failed: ${err?.message || err}`);
      res.status(400).json({ error: err?.message || 'Upload failed' });
      return;
    }
    handleUpload(req, res);
  });
});

// GET /api/research/uploads/:jobId — check ingest status
router.get('/uploads/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
  const job = getIngestJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    documentId: job.document_id,
    error: job.error_message,
    retryCount: job.retry_count,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
});

// GET /api/research/documents — list all documents with chunk/embedding counts
router.get('/documents', (_req: Request, res: Response) => {
  const db = getDb();
  const docs = db.prepare(`
    SELECT
      rd.id, rd.title, rd.source_url, rd.source_type, rd.page_count,
      rd.sha256, rd.created_at,
      (SELECT COUNT(*) FROM research_chunks WHERE document_id = rd.id) as chunk_count,
      (SELECT COUNT(*) FROM research_embeddings WHERE chunk_id IN
        (SELECT id FROM research_chunks WHERE document_id = rd.id)) as embedding_count,
      (SELECT COUNT(*) FROM research_outputs WHERE output_type = 'doc_summary'
        AND json_extract(metadata_json, '$.documentId') = rd.id) as summary_count
    FROM research_documents rd
    ORDER BY rd.created_at DESC
  `).all();

  res.json({ data: docs });
});

// GET /api/research/documents/:id — single document detail with chunks
router.get('/documents/:id', (req: Request, res: Response) => {
  const db = getDb();
  const doc = db.prepare(`
    SELECT rd.*,
      (SELECT COUNT(*) FROM research_chunks WHERE document_id = rd.id) as chunk_count,
      (SELECT COUNT(*) FROM research_embeddings WHERE chunk_id IN
        (SELECT id FROM research_chunks WHERE document_id = rd.id)) as embedding_count
    FROM research_documents rd WHERE rd.id = ?
  `).get(req.params.id);

  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const chunks = db.prepare(`
    SELECT id, page_number, chunk_index, chunk_text, token_estimate
    FROM research_chunks WHERE document_id = ? ORDER BY page_number, chunk_index
  `).all(req.params.id);

  res.json({ ...(doc as any), chunks });
});

// POST /api/research/documents/:id/summarize — generate summary
router.post('/documents/:id/summarize', async (req: Request, res: Response) => {
  try {
    const result = await generateDocumentSummary(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    logger.error(`Summarize failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/research/documents/:id — delete document + pages + chunks + embeddings
router.delete('/documents/:id', (req: Request, res: Response) => {
  const db = getDb();
  const doc = db.prepare('SELECT id, local_path FROM research_documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const deleteAll = db.transaction(() => {
    // Delete embeddings for this document's chunks
    db.prepare(`
      DELETE FROM research_embeddings WHERE chunk_id IN
        (SELECT id FROM research_chunks WHERE document_id = ?)
    `).run(req.params.id);

    // Delete output citations referencing this document
    db.prepare('DELETE FROM research_output_citations WHERE document_id = ?').run(req.params.id);

    // Delete outputs (summaries) for this document
    db.prepare(`
      DELETE FROM research_outputs WHERE output_type = 'doc_summary'
        AND json_extract(metadata_json, '$.documentId') = ?
    `).run(req.params.id);

    // Delete chunks, pages, document
    db.prepare('DELETE FROM research_chunks WHERE document_id = ?').run(req.params.id);
    db.prepare('DELETE FROM research_pages WHERE document_id = ?').run(req.params.id);
    db.prepare('DELETE FROM research_documents WHERE id = ?').run(req.params.id);
  });

  deleteAll();
  logger.info(`Deleted document ${req.params.id}`);
  res.json({ success: true });
});

// GET /api/research/outputs/:docId — get summaries/QA outputs for a document
router.get('/outputs/:docId', (req: Request, res: Response) => {
  const db = getDb();
  const outputs = db.prepare(`
    SELECT ro.id, ro.output_type, ro.prompt, ro.response_markdown, ro.metadata_json, ro.created_at
    FROM research_outputs ro
    WHERE ro.output_type = 'doc_summary'
      AND json_extract(ro.metadata_json, '$.documentId') = ?
    ORDER BY ro.created_at DESC
  `).all(req.params.docId);

  res.json({ data: outputs });
});

// POST /api/research/ask — answer question with citations
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { query, topK } = req.body;
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const result = await answerQuestionWithCitations(query, { topK });
    res.json(result);
  } catch (err: any) {
    logger.error(`Ask failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
