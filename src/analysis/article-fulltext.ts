import { extract } from '@extractus/article-extractor';
import { getDb } from '../db/connection';
import { logger } from '../shared/logger';

export async function enrichRecentArticles(limit = 30): Promise<{ processed: number; enriched: number }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, url
    FROM articles
    WHERE content IS NULL OR content = ''
    ORDER BY published_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: number; url: string }>;

  let processed = 0;
  let enriched = 0;

  for (const row of rows) {
    processed++;
    try {
      const result = await extract(row.url);
      if (!result || !result.content) continue;

      const summary = result.content.replace(/\s+/g, ' ').slice(0, 600);
      db.prepare(`
        UPDATE articles
        SET content = ?, summary_text = COALESCE(summary_text, ?), updated_at = datetime('now')
        WHERE id = ?
      `).run(result.content, summary, row.id);
      enriched++;
    } catch (err: any) {
      logger.warn(`Full-text extract failed: ${row.url} (${err?.message || err})`);
    }
  }

  return { processed, enriched };
}
