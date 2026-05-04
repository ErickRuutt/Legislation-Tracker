import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';
import { getSchedulerStatus } from '../../scheduler';
import {
  GoogleNewsCollector,
  NewsApiCollector,
  CongressCollector,
  SamGovCollector,
  RedditCollector,
} from '../../collectors';
import { generateNewsDigest, getLatestDigest } from '../../analysis/digests';
import { evaluateAlerts } from '../../alerts';
import { logger } from '../../shared/logger';

const router = Router();

const collectorMap: Record<string, new () => any> = {
  google_news: GoogleNewsCollector,
  newsapi: NewsApiCollector,
  congress: CongressCollector,
  samgov: SamGovCollector,
  reddit: RedditCollector,
};

router.get('/runs', (req: Request, res: Response) => {
  const db = getDb();
  const { collector, limit = '50' } = req.query;

  let query = 'SELECT * FROM collector_runs';
  const params: any[] = [];

  if (collector) {
    query += ' WHERE collector = ?';
    params.push(collector);
  }

  query += ` ORDER BY started_at DESC LIMIT ?`;
  params.push(parseInt(limit as string, 10));

  const runs = db.prepare(query).all(...params);
  res.json(runs);
});

router.get('/schedule', (_req: Request, res: Response) => {
  res.json(getSchedulerStatus());
});

router.post('/run/:name', async (req: Request<{ name: string }>, res: Response) => {
  const name = req.params.name;
  const CollectorClass = collectorMap[name];

  if (!CollectorClass) {
    return res.status(404).json({ error: `Unknown collector: ${name}` });
  }

  // Run async, don't block response
  const collector = new CollectorClass();
  collector.execute().then(() => {
    evaluateAlerts().catch((err: Error) => logger.error(`Post-collection alert eval failed: ${err.message}`));
  });

  res.json({ message: `Collector ${name} started` });
});

router.post('/run-all', async (_req: Request, res: Response) => {
  for (const [name, CollectorClass] of Object.entries(collectorMap)) {
    const collector = new CollectorClass();
    collector.execute().catch((err: Error) => logger.error(`Collector ${name} failed: ${err.message}`));
  }

  // Evaluate alerts after a delay
  setTimeout(() => {
    evaluateAlerts().catch((err: Error) => logger.error(`Alert eval failed: ${err.message}`));
  }, 30000);

  res.json({ message: 'All collectors started' });
});

router.post('/digest/:period', async (req: Request<{ period: string }>, res: Response) => {
  const period = req.params.period;
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'Invalid period' });
  }
  const result = await generateNewsDigest(period as any);
  res.json(result);
});

router.get('/digest/:period', (req: Request<{ period: string }>, res: Response) => {
  const period = req.params.period;
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'Invalid period' });
  }
  const latest = getLatestDigest(period as any);
  res.json({ data: latest });
});

export default router;
