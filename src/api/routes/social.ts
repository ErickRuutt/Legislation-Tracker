import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';

const router = Router();

router.get('/posts', (req: Request, res: Response) => {
  const db = getDb();
  const {
    subreddit,
    search,
    minRelevance,
    topicId,
    page = '1',
    pageSize = '25',
    sort = 'posted_at',
    order = 'desc',
  } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  let fromClause = 'FROM social_posts sp';
  if (topicId) {
    fromClause = `FROM social_posts sp INNER JOIN topic_items ti ON ti.item_type = 'social_post' AND ti.item_id = sp.id AND ti.topic_id = ?`;
    params.push(parseInt(topicId as string, 10));
  }

  if (subreddit) { conditions.push('sp.subreddit = ?'); params.push(subreddit); }
  if (search) { conditions.push('(sp.title LIKE ? OR sp.body LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (minRelevance) { conditions.push('sp.relevance_score >= ?'); params.push(parseFloat(minRelevance as string)); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts = ['posted_at', 'score', 'relevance_score', 'num_comments'];
  const rawSort = sort as string;
  const sortCol = allowedSorts.includes(rawSort) ? `sp.${rawSort}` : 'sp.posted_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const total = (db.prepare(`SELECT COUNT(*) as c ${fromClause} ${where}`).get(...params) as any).c;

  const limit = Math.min(parseInt(pageSize as string, 10), 100);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  const data = db.prepare(
    `SELECT sp.* ${fromClause} ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data, total, page: parseInt(page as string, 10), pageSize: limit });
});

router.get('/stats', (req: Request, res: Response) => {
  const db = getDb();
  const { subreddit, days = '30' } = req.query;

  const conditions: string[] = [`date >= date('now', '-${parseInt(days as string, 10)} days')`];
  const params: any[] = [];

  if (subreddit) {
    conditions.push('subreddit = ?');
    params.push(subreddit);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const data = db.prepare(`
    SELECT date, SUM(post_count) as post_count, SUM(comment_count) as comment_count, AVG(avg_score) as avg_score
    FROM social_daily_stats
    ${where}
    GROUP BY date
    ORDER BY date ASC
  `).all(...params);

  res.json(data);
});

router.get('/subreddits', (_req: Request, res: Response) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT subreddit, COUNT(*) as post_count, AVG(relevance_score) as avg_relevance
    FROM social_posts
    GROUP BY subreddit
    ORDER BY post_count DESC
  `).all();
  res.json(data);
});

export default router;
