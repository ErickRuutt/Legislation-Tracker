import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';
import { invalidateTopicCache } from '../../analysis/topic-matcher';
import { logger } from '../../shared/logger';

const router = Router();

// GET /api/topics — list all topics with item counts
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const topics = db.prepare(`
    SELECT
      t.*,
      (SELECT COUNT(*) FROM topic_items WHERE topic_id = t.id AND item_type = 'article') as article_count,
      (SELECT COUNT(*) FROM topic_items WHERE topic_id = t.id AND item_type = 'legislation') as legislation_count,
      (SELECT COUNT(*) FROM topic_items WHERE topic_id = t.id AND item_type = 'contract') as contract_count,
      (SELECT COUNT(*) FROM topic_items WHERE topic_id = t.id AND item_type = 'social_post') as social_count
    FROM topics t
    ORDER BY t.active DESC, t.name ASC
  `).all();
  res.json({ data: topics });
});

// GET /api/topics/:id — single topic detail
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(req.params.id);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }
  res.json(topic);
});

// POST /api/topics — create topic
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { name, slug, description, keywords_json, category_weights_json } = req.body;

  if (!name || !slug) {
    res.status(400).json({ error: 'name and slug are required' });
    return;
  }

  try {
    const result = db.prepare(`
      INSERT INTO topics (name, slug, description, keywords_json, category_weights_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      slug,
      description || null,
      JSON.stringify(keywords_json || []),
      JSON.stringify(category_weights_json || {})
    );

    invalidateTopicCache();
    logger.info(`Topic created: ${name}`);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, slug });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Topic name or slug already exists' });
      return;
    }
    res.status(500).json({ error: err?.message || 'Failed to create topic' });
  }
});

// PUT /api/topics/:id — update topic
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const topic = db.prepare('SELECT id FROM topics WHERE id = ?').get(req.params.id);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  const { name, slug, description, keywords_json, category_weights_json, active } = req.body;

  db.prepare(`
    UPDATE topics SET
      name = COALESCE(?, name),
      slug = COALESCE(?, slug),
      description = COALESCE(?, description),
      keywords_json = COALESCE(?, keywords_json),
      category_weights_json = COALESCE(?, category_weights_json),
      active = COALESCE(?, active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? null,
    slug ?? null,
    description ?? null,
    keywords_json ? JSON.stringify(keywords_json) : null,
    category_weights_json ? JSON.stringify(category_weights_json) : null,
    active !== undefined ? (active ? 1 : 0) : null,
    req.params.id
  );

  invalidateTopicCache();
  logger.info(`Topic updated: ${req.params.id}`);
  res.json({ success: true });
});

// DELETE /api/topics/:id — deactivate (soft delete)
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const topic = db.prepare('SELECT id, name FROM topics WHERE id = ?').get(req.params.id) as any;
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  db.prepare(`UPDATE topics SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  invalidateTopicCache();
  logger.info(`Topic deactivated: ${topic.name}`);
  res.json({ success: true });
});

export default router;
