import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/connection';
import { backfillArticleMentions } from '../../analysis/legislation-mentions';
import { enrichRecentArticles } from '../../analysis/article-fulltext';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    source,
    region,
    search,
    minRelevance,
    favorite,
    topicId,
    page = '1',
    pageSize = '25',
    sort = 'published_at',
    order = 'desc',
  } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  let fromClause = 'FROM articles a';
  if (topicId) {
    fromClause = 'FROM articles a INNER JOIN topic_items ti ON ti.item_type = \'article\' AND ti.item_id = a.id AND ti.topic_id = ?';
    params.push(parseInt(topicId as string, 10));
  }

  if (source) { conditions.push('a.source = ?'); params.push(source); }
  if (region) { conditions.push('a.region = ?'); params.push(region); }
  if (search) { conditions.push('(a.title LIKE ? OR a.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (minRelevance) { conditions.push('a.relevance_score >= ?'); params.push(parseFloat(minRelevance as string)); }
  if (favorite) { conditions.push('a.is_favorite = ?'); params.push(favorite === 'true' ? 1 : 0); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['published_at', 'relevance_score', 'created_at'];
  const rawSort = sort as string;
  const sortCol = allowedSorts.includes(rawSort) ? `a.${rawSort}` : 'a.published_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const total = (db.prepare(`SELECT COUNT(*) as c ${fromClause} ${where}`).get(...params) as any).c;

  const limit = Math.min(parseInt(pageSize as string, 10), 100);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  const data = db.prepare(
    `SELECT a.* ${fromClause} ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data, total, page: parseInt(page as string, 10), pageSize: limit });
});

router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }
  const notes = db.prepare('SELECT * FROM article_notes WHERE article_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ article, notes });
});

router.patch('/:id/favorite', (req: Request<{ id: string }>, res: Response) => {
  const db = getDb();
  const isFavorite = req.body?.isFavorite ? 1 : 0;
  db.prepare('UPDATE articles SET is_favorite = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(isFavorite, req.params.id);
  res.json({ success: true, isFavorite: !!isFavorite });
});

router.patch('/:id/tags', (req: Request<{ id: string }>, res: Response) => {
  const db = getDb();
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
  db.prepare('UPDATE articles SET tags_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(tags), req.params.id);
  res.json({ success: true, tags });
});

router.post('/:id/notes', (req: Request<{ id: string }>, res: Response) => {
  const db = getDb();
  const note = (req.body?.note || '').trim();
  if (!note) {
    res.status(400).json({ error: 'Note is required' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO article_notes (id, article_id, note_text) VALUES (?, ?, ?)')
    .run(id, req.params.id, note);
  res.json({ id, note_text: note });
});

router.post('/backfill/mentions', (req: Request, res: Response) => {
  const limit = parseInt(req.body?.limit || '500', 10);
  const result = backfillArticleMentions(limit);
  res.json(result);
});

router.post('/enrich/fulltext', async (req: Request, res: Response) => {
  const limit = parseInt(req.body?.limit || '30', 10);
  const result = await enrichRecentArticles(limit);
  res.json(result);
});

export default router;
