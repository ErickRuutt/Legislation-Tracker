import { getDb } from '../db/connection';
import { embedText } from '../shared/openai';
import { logger } from '../shared/logger';
import { extractRequiredTokens } from './query-tokens';

interface SearchOptions {
  topK?: number;
  documentIds?: string[];
  minSimilarity?: number;
}

interface SearchResult {
  chunkId: string;
  chunkText: string;
  similarity: number;
  tokenMatchCount?: number;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  sourceUrl: string | null;
}

interface CachedRow {
  chunkId: string;
  chunkText: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  sourceUrl: string | null;
  vector: number[];
}

let cachedRows: CachedRow[] | null = null;
let cachedCount = 0;

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

export async function searchResearchCorpus(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { topK = 8, documentIds, minSimilarity = 0.0 } = options;
  const db = getDb();
  const requiredTokens = extractRequiredTokens(query);

  // 1. Embed the query
  logger.info(`Embedding query: "${query.slice(0, 80)}..."`);
  const queryVector = await embedText(query);

  // 2. Load candidate embeddings from SQLite (cached)
  const countRow = db.prepare('SELECT COUNT(*) as c FROM research_embeddings').get() as any;
  const totalCount = countRow?.c || 0;

  if (!cachedRows || cachedCount !== totalCount) {
    const rows = db.prepare(`
      SELECT
        re.chunk_id, re.vector_json,
        rc.chunk_text, rc.document_id, rc.page_number, rc.chunk_index,
        rd.title as document_title, rd.source_url
      FROM research_embeddings re
      JOIN research_chunks rc ON rc.id = re.chunk_id
      JOIN research_documents rd ON rd.id = rc.document_id
    `).all() as Array<{
      chunk_id: string;
      vector_json: string;
      chunk_text: string;
      document_id: string;
      page_number: number;
      chunk_index: number;
      document_title: string;
      source_url: string | null;
    }>;

    cachedRows = rows.map((row) => ({
      chunkId: row.chunk_id,
      chunkText: row.chunk_text,
      documentId: row.document_id,
      documentTitle: row.document_title,
      pageNumber: row.page_number,
      chunkIndex: row.chunk_index,
      sourceUrl: row.source_url,
      vector: JSON.parse(row.vector_json),
    }));
    cachedCount = totalCount;
    logger.info(`Loaded ${cachedRows.length} embeddings into cache`);
  }

  const rows = cachedRows || [];
  const filteredRows = documentIds && documentIds.length > 0
    ? rows.filter((r) => documentIds.includes(r.documentId))
    : rows;

  if (filteredRows.length === 0) {
    logger.warn('No embeddings found in corpus');
    return [];
  }

  logger.info(`Computing similarity against ${filteredRows.length} chunks`);

  // 3. Compute cosine similarity
  const scored: SearchResult[] = [];

  for (const row of filteredRows) {
    const similarity = cosineSimilarity(queryVector, row.vector);

    if (similarity >= minSimilarity) {
      const tokenMatchCount = countTokenMatches(row.chunkText, requiredTokens);
      scored.push({
        chunkId: row.chunkId,
        chunkText: row.chunkText,
        similarity: Math.round(similarity * 10000) / 10000,
        tokenMatchCount,
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        pageNumber: row.pageNumber,
        chunkIndex: row.chunkIndex,
        sourceUrl: row.sourceUrl,
      });
    }
  }

  // 4. If query has required tokens (dates), prefer chunks that contain them
  let filtered = scored;
  if (requiredTokens.length > 0) {
    const withTokens = scored.filter((s) => (s.tokenMatchCount || 0) > 0);
    if (withTokens.length > 0) {
      filtered = withTokens;
    }
  }

  // 5. Sort by token matches (desc), then similarity
  filtered.sort((a, b) => {
    const t = (b.tokenMatchCount || 0) - (a.tokenMatchCount || 0);
    if (t !== 0) return t;
    return b.similarity - a.similarity;
  });

  return filtered.slice(0, topK);
}

function countTokenMatches(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  for (const token of tokens) {
    if (lower.includes(token.toLowerCase())) count++;
  }
  return count;
}
