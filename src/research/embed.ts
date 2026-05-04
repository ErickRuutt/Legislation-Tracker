import { getDb } from '../db/connection';
import { embedBatch, EMBEDDING_MODEL, EMBEDDING_DIMS } from '../shared/openai';
import { logger } from '../shared/logger';

interface EmbedResult {
  documentId: string;
  totalChunks: number;
  newEmbeddings: number;
  skipped: number;
}

export async function embedDocument(documentId: string): Promise<EmbedResult> {
  const db = getDb();

  // Verify document exists
  const doc = db.prepare('SELECT id, title FROM research_documents WHERE id = ?').get(documentId) as any;
  if (!doc) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Get all chunks for this document
  const allChunks = db.prepare(
    'SELECT id, chunk_text FROM research_chunks WHERE document_id = ? ORDER BY page_number, chunk_index'
  ).all(documentId) as Array<{ id: string; chunk_text: string }>;

  // Find chunks that don't have embeddings yet (idempotent)
  const existingIds = new Set(
    (db.prepare(
      'SELECT chunk_id FROM research_embeddings WHERE chunk_id IN (SELECT id FROM research_chunks WHERE document_id = ?)'
    ).all(documentId) as Array<{ chunk_id: string }>).map((r) => r.chunk_id)
  );

  const chunksToEmbed = allChunks.filter((c) => !existingIds.has(c.id));

  if (chunksToEmbed.length === 0) {
    logger.info(`All ${allChunks.length} chunks already embedded for "${doc.title}"`);
    return {
      documentId,
      totalChunks: allChunks.length,
      newEmbeddings: 0,
      skipped: allChunks.length,
    };
  }

  logger.info(`Embedding ${chunksToEmbed.length} chunks for "${doc.title}" (${existingIds.size} already done)`);

  // Embed in batches
  const texts = chunksToEmbed.map((c) => c.chunk_text);
  const embeddings = await embedBatch(texts);

  // Store embeddings
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO research_embeddings (chunk_id, embedding_model, dims, vector_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < chunksToEmbed.length; i++) {
      insertStmt.run(
        chunksToEmbed[i].id,
        EMBEDDING_MODEL,
        EMBEDDING_DIMS,
        JSON.stringify(embeddings[i])
      );
    }
  });

  insertAll();

  logger.info(`Embedded ${chunksToEmbed.length} new chunks for "${doc.title}"`);

  return {
    documentId,
    totalChunks: allChunks.length,
    newEmbeddings: chunksToEmbed.length,
    skipped: existingIds.size,
  };
}

export async function embedAllMissing(): Promise<{ total: number; embedded: number }> {
  const db = getDb();

  const missing = db.prepare(`
    SELECT rc.id, rc.chunk_text
    FROM research_chunks rc
    LEFT JOIN research_embeddings re ON re.chunk_id = rc.id
    WHERE re.chunk_id IS NULL
    ORDER BY rc.document_id, rc.page_number, rc.chunk_index
  `).all() as Array<{ id: string; chunk_text: string }>;

  if (missing.length === 0) {
    logger.info('All chunks already have embeddings');
    return { total: 0, embedded: 0 };
  }

  logger.info(`Found ${missing.length} chunks without embeddings`);

  const texts = missing.map((c) => c.chunk_text);
  const embeddings = await embedBatch(texts);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO research_embeddings (chunk_id, embedding_model, dims, vector_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < missing.length; i++) {
      insertStmt.run(missing[i].id, EMBEDDING_MODEL, EMBEDDING_DIMS, JSON.stringify(embeddings[i]));
    }
  });

  insertAll();

  logger.info(`Embedded ${missing.length} chunks`);
  return { total: missing.length, embedded: missing.length };
}
