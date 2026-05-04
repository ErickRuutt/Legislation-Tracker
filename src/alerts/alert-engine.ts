import { getDb } from '../db/connection';
import { logger } from '../shared/logger';
import { sendAlertEmail } from './email-sender';
import type { Alert, AlertRule } from '../shared/types';

export async function evaluateAlerts(): Promise<void> {
  const db = getDb();

  const rules = db.prepare(
    'SELECT * FROM alert_rules WHERE enabled = 1'
  ).all() as AlertRule[];

  for (const rule of rules) {
    try {
      const conditions = JSON.parse(rule.conditions);

      switch (rule.type) {
        case 'new_bill':
          await checkNewBills(db, rule, conditions);
          break;
        case 'bill_status_change':
          await checkBillStatusChanges(db, rule, conditions);
          break;
        case 'contract_deadline':
          await checkContractDeadlines(db, rule, conditions);
          break;
        case 'new_contract':
          await checkNewContracts(db, rule, conditions);
          break;
        case 'social_spike':
          await checkSocialSpike(db, rule, conditions);
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Alert rule [${rule.name}] evaluation failed: ${msg}`);
    }
  }
}

async function createAlert(
  db: ReturnType<typeof getDb>,
  ruleId: number,
  type: string,
  severity: Alert['severity'],
  title: string,
  message: string,
  data?: object
): Promise<void> {
  // Check for duplicate alert in last 24h
  const existing = db.prepare(`
    SELECT id FROM alerts WHERE rule_id = ? AND title = ? AND created_at > datetime('now', '-1 day')
  `).get(ruleId, title);

  if (existing) return;

  const result = db.prepare(`
    INSERT INTO alerts (rule_id, type, severity, title, message, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ruleId, type, severity, title, message, data ? JSON.stringify(data) : null);

  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(
    Number(result.lastInsertRowid)
  ) as Alert;

  logger.info(`Alert created: [${severity}] ${title}`);

  // Send email for critical/high alerts
  if (severity === 'critical' || severity === 'high') {
    const sent = await sendAlertEmail(alert);
    if (sent) {
      db.prepare('UPDATE alerts SET email_sent = 1 WHERE id = ?').run(alert.id);
    }
  }
}

async function checkNewBills(
  db: ReturnType<typeof getDb>,
  rule: AlertRule,
  conditions: { sources?: string[]; minRelevance?: number }
): Promise<void> {
  const sources = conditions.sources || ['congress', 'wa_legislature', 'or_legislature'];
  const minRelevance = conditions.minRelevance || 0.3;

  const bills = db.prepare(`
    SELECT * FROM legislation
    WHERE source IN (${sources.map(() => '?').join(',')})
      AND relevance_score >= ?
      AND created_at > datetime('now', '-6 hours')
  `).all(...sources, minRelevance) as any[];

  for (const bill of bills) {
    const severity = bill.relevance_score >= 0.7 ? 'critical' as const : 'high' as const;
    await createAlert(
      db, rule.id, 'new_bill', severity,
      `New Bill: ${bill.bill_number}`,
      `${bill.title}\n\nSource: ${bill.source} | Relevance: ${(bill.relevance_score * 100).toFixed(0)}%`,
      { billId: bill.id, billNumber: bill.bill_number }
    );
  }
}

async function checkBillStatusChanges(
  db: ReturnType<typeof getDb>,
  rule: AlertRule,
  conditions: { statuses?: string[] }
): Promise<void> {
  const statuses = conditions.statuses || ['passed_committee', 'passed_chamber', 'signed'];

  const changes = db.prepare(`
    SELECT lh.*, l.bill_number, l.title as bill_title
    FROM legislation_history lh
    JOIN legislation l ON l.id = lh.legislation_id
    WHERE lh.status IN (${statuses.map(() => '?').join(',')})
      AND lh.recorded_at > datetime('now', '-6 hours')
  `).all(...statuses) as any[];

  for (const change of changes) {
    await createAlert(
      db, rule.id, 'bill_status_change', 'high',
      `Bill ${change.bill_number} Status: ${change.status}`,
      `${change.bill_title}\n\nNew status: ${change.status}\n${change.description || ''}`,
      { legislationId: change.legislation_id }
    );
  }
}

async function checkContractDeadlines(
  db: ReturnType<typeof getDb>,
  rule: AlertRule,
  conditions: { daysThreshold?: number }
): Promise<void> {
  const days = conditions.daysThreshold || 7;
  const severity = days <= 3 ? 'critical' as const : days <= 7 ? 'high' as const : 'medium' as const;

  const contracts = db.prepare(`
    SELECT * FROM contracts
    WHERE response_deadline IS NOT NULL
      AND date(response_deadline) BETWEEN date('now') AND date('now', '+' || ? || ' days')
      AND relevance_score >= 0.3
  `).all(days) as any[];

  for (const contract of contracts) {
    const deadline = new Date(contract.response_deadline);
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    await createAlert(
      db, rule.id, 'contract_deadline', severity,
      `Contract Deadline: ${daysLeft} days`,
      `${contract.title}\n\nAgency: ${contract.agency || 'N/A'}\nDeadline: ${contract.response_deadline}\nNAICS: ${contract.naics_code || 'N/A'}`,
      { contractId: contract.id, noticeId: contract.notice_id }
    );
  }
}

async function checkNewContracts(
  db: ReturnType<typeof getDb>,
  rule: AlertRule,
  conditions: { minRelevance?: number }
): Promise<void> {
  const minRelevance = conditions.minRelevance || 0.7;

  const contracts = db.prepare(`
    SELECT * FROM contracts
    WHERE relevance_score >= ?
      AND created_at > datetime('now', '-4 hours')
  `).all(minRelevance) as any[];

  for (const contract of contracts) {
    await createAlert(
      db, rule.id, 'new_contract', 'high',
      `New High-Relevance Contract`,
      `${contract.title}\n\nAgency: ${contract.agency || 'N/A'}\nDeadline: ${contract.response_deadline || 'TBD'}\nRelevance: ${(contract.relevance_score * 100).toFixed(0)}%`,
      { contractId: contract.id }
    );
  }
}

async function checkSocialSpike(
  db: ReturnType<typeof getDb>,
  rule: AlertRule,
  conditions: { multiplier?: number }
): Promise<void> {
  const multiplier = conditions.multiplier || 2;

  // Get today's total vs 30-day average
  const today = db.prepare(`
    SELECT SUM(post_count) as total FROM social_daily_stats
    WHERE date = date('now')
  `).get() as { total: number | null };

  const avg = db.prepare(`
    SELECT AVG(daily_total) as avg FROM (
      SELECT date, SUM(post_count) as daily_total FROM social_daily_stats
      WHERE date BETWEEN date('now', '-30 days') AND date('now', '-1 day')
      GROUP BY date
    )
  `).get() as { avg: number | null };

  if (today?.total && avg?.avg && today.total >= avg.avg * multiplier) {
    const severity = multiplier >= 3 ? 'critical' as const : 'high' as const;
    await createAlert(
      db, rule.id, 'social_spike', severity,
      `Social Volume Spike: ${multiplier}x average`,
      `Today's post count (${today.total}) is ${(today.total / avg.avg).toFixed(1)}x the 30-day average (${avg.avg.toFixed(1)}).`,
      { todayCount: today.total, avgCount: avg.avg }
    );
  }
}
