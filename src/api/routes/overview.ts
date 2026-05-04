import { Router, Request, Response } from 'express';
import { getDb } from '../../db/connection';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();

  const totalBills = (db.prepare('SELECT COUNT(*) as c FROM legislation').get() as any).c;
  const activeBills = (db.prepare("SELECT COUNT(*) as c FROM legislation WHERE status NOT IN ('signed', 'vetoed', 'dead')").get() as any).c;
  const totalContracts = (db.prepare('SELECT COUNT(*) as c FROM contracts').get() as any).c;
  const upcomingDeadlines = (db.prepare("SELECT COUNT(*) as c FROM contracts WHERE response_deadline IS NOT NULL AND date(response_deadline) BETWEEN date('now') AND date('now', '+14 days')").get() as any).c;
  const totalArticles = (db.prepare('SELECT COUNT(*) as c FROM articles').get() as any).c;
  const recentArticles = (db.prepare("SELECT COUNT(*) as c FROM articles WHERE created_at > datetime('now', '-24 hours')").get() as any).c;
  const totalSocialPosts = (db.prepare('SELECT COUNT(*) as c FROM social_posts').get() as any).c;
  const unresolvedAlerts = (db.prepare('SELECT COUNT(*) as c FROM alerts WHERE acknowledged = 0').get() as any).c;

  const recentAlerts = db.prepare(
    'SELECT * FROM alerts ORDER BY created_at DESC LIMIT 10'
  ).all();

  const recentActivity = db.prepare(
    'SELECT * FROM collector_runs ORDER BY started_at DESC LIMIT 10'
  ).all();

  res.json({
    totalBills,
    activeBills,
    totalContracts,
    upcomingDeadlines,
    totalArticles,
    recentArticles,
    totalSocialPosts,
    unresolvedAlerts,
    recentAlerts,
    recentActivity,
  });
});

export default router;
