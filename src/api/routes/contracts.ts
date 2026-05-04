import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    naics,
    search,
    upcoming,
    topicId,
    page = '1',
    pageSize = '25',
    sort = 'response_deadline',
    order = 'asc',
  } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  let fromClause = 'FROM contracts c';
  if (topicId) {
    fromClause = `FROM contracts c INNER JOIN topic_items ti ON ti.item_type = 'contract' AND ti.item_id = c.id AND ti.topic_id = ?`;
    params.push(parseInt(topicId as string, 10));
  }

  if (naics) { conditions.push('c.naics_code = ?'); params.push(naics); }
  if (search) { conditions.push('(c.title LIKE ? OR c.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (upcoming === 'true') { conditions.push("c.response_deadline IS NOT NULL AND date(c.response_deadline) >= date('now')"); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['response_deadline', 'posted_date', 'relevance_score', 'title'];
  const rawSort = sort as string;
  const sortCol = allowedSorts.includes(rawSort) ? `c.${rawSort}` : 'c.response_deadline';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

  const total = (db.prepare(`SELECT COUNT(*) as c ${fromClause} ${where}`).get(...params) as any).c;

  const limit = Math.min(parseInt(pageSize as string, 10), 100);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  const data = db.prepare(
    `SELECT c.* ${fromClause} ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data, total, page: parseInt(page as string, 10), pageSize: limit });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Not found' });
  res.json(contract);
});

export default router;
