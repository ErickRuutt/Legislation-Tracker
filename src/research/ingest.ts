import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import { getDb } from '../db/connection';
import { logger } from '../shared/logger';

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const PDF_STORAGE_DIR = path.join(PROJECT_ROOT, 'data/research_pdfs');
const MAX_CHUNK_CHARS = 1500; // ~375 tokens; split pages larger than this
const CHUNK_OVERLAP_CHARS = 150;

function generateId(): string {
  return crypto.randomUUID();
}

function computeSha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface IngestOptions {
  filePath: string;
  title: string;
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

interface IngestResult {
  documentId: string;
  title: string;
  pageCount: number;
  chunkCount: number;
  alreadyExists: boolean;
}

export async function ingestPdf(options: IngestOptions): Promise<IngestResult> {
  const { filePath, title, sourceUrl, metadata } = options;
  const db = getDb();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const sha256 = computeSha256File(filePath);

  // Check for duplicate
  const existing = db.prepare('SELECT id, title FROM research_documents WHERE sha256 = ?').get(sha256) as any;
  if (existing) {
    logger.info(`Document already ingested: "${existing.title}" (${existing.id})`);
    const chunkCount = (db.prepare('SELECT COUNT(*) as c FROM research_chunks WHERE document_id = ?').get(existing.id) as any).c;
    return {
      documentId: existing.id,
      title: existing.title,
      pageCount: 0,
      chunkCount,
      alreadyExists: true,
    };
  }

  // Copy PDF to storage directory
  if (!fs.existsSync(PDF_STORAGE_DIR)) {
    fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
  }
  const storedFilename = `${sha256.slice(0, 12)}_${path.basename(filePath)}`;
  const storedPath = path.join(PDF_STORAGE_DIR, storedFilename);
  fs.copyFileSync(filePath, storedPath);

  // Extract text in the worker process (separate heap — avoids OOM in server)
  logger.info(`Extracting text from: ${path.basename(filePath)}`);
  const { pages: pageTexts, numpages } = await extractPdfPages(storedPath);
  const pageCount = pageTexts.length || numpages || 0;

  logger.info(`Extracted ${pageCount} pages from "${title}"`);

  // Create document record
  const documentId = generateId();
  db.prepare(`
    INSERT INTO research_documents (id, source_url, title, source_type, local_path, sha256, page_count, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentId,
    sourceUrl || null,
    title,
    sourceUrl ? 'pdf_url' : 'pdf_upload',
    storedPath,
    sha256,
    pageCount,
    JSON.stringify(metadata || {})
  );

  // Insert pages and chunks
  const insertPage = db.prepare(`
    INSERT INTO research_pages (id, document_id, page_number, page_text, char_start, char_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertChunk = db.prepare(`
    INSERT INTO research_chunks (id, document_id, page_number, chunk_index, chunk_text, char_start_in_page, char_end_in_page, token_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalChunks = 0;
  let runningCharOffset = 0;

  const insertAll = db.transaction(() => {
    for (let pageIdx = 0; pageIdx < pageTexts.length; pageIdx++) {
      const pageNum = pageIdx + 1;
      const pageText = pageTexts[pageIdx].trim();

      if (!pageText) {
        logger.warn(`Page ${pageNum} is empty, skipping`);
        continue;
      }

      const charStart = runningCharOffset;
      const charEnd = runningCharOffset + pageText.length;
      runningCharOffset = charEnd;

      insertPage.run(generateId(), documentId, pageNum, pageText, charStart, charEnd);

      const chunks = chunkPageText(pageText);
      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        const chunkId = `${documentId}_p${pageNum}_c${chunkIdx}`;
        insertChunk.run(
          chunkId,
          documentId,
          pageNum,
          chunkIdx,
          chunk.text,
          chunk.startInPage,
          chunk.endInPage,
          estimateTokens(chunk.text)
        );
        totalChunks++;
      }
    }
  });

  insertAll();

  logger.info(`Ingested "${title}": ${pageCount} pages, ${totalChunks} chunks`);

  return {
    documentId,
    title,
    pageCount,
    chunkCount: totalChunks,
    alreadyExists: false,
  };
}

// ─── PDF text extraction with true page boundaries ───────────

async function extractPdfPages(filePath: string): Promise<{ pages: string[]; numpages: number }> {
  const buffer = fs.readFileSync(filePath);
  const pages: string[] = [];

  const data = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      pages.push(text);
      return text;
    },
  });

  if (pages.length === 0 && data.text) {
    return { pages: [data.text], numpages: data.numpages || 1 };
  }

  return { pages, numpages: data.numpages || pages.length };
}

// ─── Chunking ────────────────────────────────────────────────

interface ChunkInfo {
  text: string;
  startInPage: number;
  endInPage: number;
}

function chunkPageText(pageText: string): ChunkInfo[] {
  if (pageText.length <= MAX_CHUNK_CHARS) {
    return [{ text: pageText, startInPage: 0, endInPage: pageText.length }];
  }

  const chunks: ChunkInfo[] = [];
  let start = 0;

  while (start < pageText.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, pageText.length);

    if (end < pageText.length) {
      const searchStart = Math.max(end - 300, start);
      const segment = pageText.slice(searchStart, end);
      const lastPeriod = Math.max(segment.lastIndexOf('. '), segment.lastIndexOf('! '), segment.lastIndexOf('? '));
      const lastNewline = segment.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > 0) {
        end = searchStart + breakPoint + 1;
      }
    }

    chunks.push({
      text: pageText.slice(start, end).trim(),
      startInPage: start,
      endInPage: end,
    });

    start = end - CHUNK_OVERLAP_CHARS;
    if (start >= pageText.length) break;
  }

  return chunks;
}
