import { getDb } from '../db/connection';
import { logger } from '../shared/logger';
import { matchTopics } from '../analysis/topic-matcher';
import type { CollectorRun } from '../shared/types';

export abstract class BaseCollector {
  abstract readonly name: string;

  protected db: import('better-sqlite3').Database = getDb();
  protected runId: number | null = null;

  async execute(): Promise<void> {
    this.db = getDb();
    this.runId = this.startRun();
    let itemsFound = 0;
    let itemsNew = 0;

    try {
      logger.info(`Collector [${this.name}] starting`);
      const result = await this.collect();
      itemsFound = result.found;
      itemsNew = result.new;

      this.finishRun(itemsFound, itemsNew);
      logger.info(`Collector [${this.name}] complete`, { found: itemsFound, new: itemsNew });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.failRun(msg);
      logger.error(`Collector [${this.name}] failed: ${msg}`);
    }
  }

  protected abstract collect(): Promise<{ found: number; new: number }>;

  private startRun(): number {
    const stmt = this.db.prepare(
      'INSERT INTO collector_runs (collector, status) VALUES (?, ?)'
    );
    const result = stmt.run(this.name, 'running');
    return Number(result.lastInsertRowid);
  }

  private finishRun(found: number, newItems: number): void {
    if (!this.runId) return;
    this.db.prepare(
      `UPDATE collector_runs SET status = 'success', items_found = ?, items_new = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(found, newItems, this.runId);
  }

  private failRun(error: string): void {
    if (!this.runId) return;
    this.db.prepare(
      `UPDATE collector_runs SET status = 'error', error_message = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(error, this.runId);
  }

  protected insertTopicItems(itemType: 'article' | 'legislation' | 'contract' | 'social_post', itemId: number, text: string): void {
    const matches = matchTopics(text);
    if (matches.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO topic_items (topic_id, item_type, item_id, relevance_score)
       VALUES (?, ?, ?, ?)`
    );

    const insertAll = this.db.transaction(() => {
      for (const match of matches) {
        stmt.run(match.topicId, itemType, itemId, match.score);
      }
    });

    insertAll();
  }

  protected getConfig(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  protected setConfig(key: string, value: string): void {
    this.db.prepare(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  }
}
