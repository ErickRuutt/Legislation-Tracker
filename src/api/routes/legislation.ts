import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    source,
    status,
    search,
    topicId,
    governmentLevel,
    jurisdiction,
    page = '1',
    pageSize = '25',
    sort = 'updated_at',
    order = 'desc',
  } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  let fromClause = 'FROM legislation l';
  if (topicId) {
    fromClause = `FROM legislation l INNER JOIN topic_items ti ON ti.item_type = 'legislation' AND ti.item_id = l.id AND ti.topic_id = ?`;
    params.push(parseInt(topicId as string, 10));
  }

  if (source) { conditions.push('l.source = ?'); params.push(source); }
  if (status) { conditions.push('l.status = ?'); params.push(status); }
  if (governmentLevel) { conditions.push('l.government_level = ?'); params.push(governmentLevel); }
  if (jurisdiction) { conditions.push('l.jurisdiction = ?'); params.push(jurisdiction); }
  if (search) { conditions.push('(l.title LIKE ? OR l.bill_number LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['updated_at', 'introduced_date', 'relevance_score', 'bill_number'];
  const rawSort = sort as string;
  const sortCol = allowedSorts.includes(rawSort) ? `l.${rawSort}` : 'l.updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const total = (db.prepare(`SELECT COUNT(*) as c ${fromClause} ${where}`).get(...params) as any).c;

  const limit = Math.min(parseInt(pageSize as string, 10), 100);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  const data = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM article_legislation_mentions alm WHERE alm.legislation_id = l.id) as mention_count
    ${fromClause} ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ data, total, page: parseInt(page as string, 10), pageSize: limit });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const bill = db.prepare('SELECT * FROM legislation WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Not found' });

  const history = db.prepare(
    'SELECT * FROM legislation_history WHERE legislation_id = ? ORDER BY action_date DESC, recorded_at DESC'
  ).all(req.params.id);

  const mentions = db.prepare(
    'SELECT * FROM article_legislation_mentions WHERE legislation_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.id);

  res.json({ ...bill as object, history, mentions });
});

router.get('/coverage/gaps', (req: Request, res: Response) => {
  const db = getDb();
  const days = parseInt((req.query.days as string) || '30', 10);
  const limit = Math.min(parseInt((req.query.limit as string) || '25', 10), 200);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = db.prepare(`
    SELECT
      l.*,
      COALESCE(h.action_count, 0) as action_count,
      COALESCE(m.mention_count, 0) as mention_count
    FROM legislation l
    LEFT JOIN (
      SELECT legislation_id, COUNT(*) as action_count
      FROM legislation_history
      WHERE action_date >= ?
      GROUP BY legislation_id
    ) h ON h.legislation_id = l.id
    LEFT JOIN (
      SELECT legislation_id, COUNT(*) as mention_count
      FROM article_legislation_mentions
      WHERE created_at >= ?
      GROUP BY legislation_id
    ) m ON m.legislation_id = l.id
    WHERE COALESCE(h.action_count, 0) > 0
    ORDER BY h.action_count DESC, m.mention_count ASC
    LIMIT ?
  `).all(since, since, limit);

  res.json({ data: rows, since, days, limit });
});

export default router;
