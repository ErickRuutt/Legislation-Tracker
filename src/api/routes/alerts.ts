import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    type,
    severity,
    acknowledged,
    page = '1',
    pageSize = '25',
  } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (severity) {
    conditions.push('severity = ?');
    params.push(severity);
  }
  if (acknowledged !== undefined) {
    conditions.push('acknowledged = ?');
    params.push(acknowledged === 'true' ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as c FROM alerts ${where}`).get(...params) as any).c;

  const limit = Math.min(parseInt(pageSize as string, 10), 100);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  const data = db.prepare(
    `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ data, total, page: parseInt(page as string, 10), pageSize: limit });
});

router.patch('/:id/acknowledge', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare(
    "UPDATE alerts SET acknowledged = 1, acknowledged_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);

  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  res.json(alert);
});

// Alert rules CRUD
router.get('/rules', (_req: Request, res: Response) => {
  const db = getDb();
  const rules = db.prepare('SELECT * FROM alert_rules ORDER BY id').all();
  res.json(rules);
});

router.post('/rules', (req: Request, res: Response) => {
  const db = getDb();
  const { name, type, conditions, enabled = true } = req.body;

  const result = db.prepare(
    'INSERT INTO alert_rules (name, type, conditions, enabled) VALUES (?, ?, ?, ?)'
  ).run(name, type, JSON.stringify(conditions), enabled ? 1 : 0);

  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(
    Number(result.lastInsertRowid)
  );
  res.status(201).json(rule);
});

router.patch('/rules/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { name, conditions, enabled } = req.body;

  if (name !== undefined) {
    db.prepare("UPDATE alert_rules SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, req.params.id);
  }
  if (conditions !== undefined) {
    db.prepare("UPDATE alert_rules SET conditions = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(conditions), req.params.id);
  }
  if (enabled !== undefined) {
    db.prepare("UPDATE alert_rules SET enabled = ?, updated_at = datetime('now') WHERE id = ?").run(enabled ? 1 : 0, req.params.id);
  }

  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id);
  res.json(rule);
});

router.delete('/rules/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
