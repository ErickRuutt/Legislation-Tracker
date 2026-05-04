import https from 'https';
import { BaseCollector } from './base-collector';
import { matchKeywords } from '../analysis/keyword-matcher';
import { config } from '../shared/config';
import { logger } from '../shared/logger';

interface CongressBill {
  congress: number;
  type: string;
  number: number;
  title: string;
  latestAction?: { actionDate: string; text: string };
  url: string;
  introducedDate?: string;
  originChamber?: string;
  originChamberCode?: string;
  policyArea?: { name: string };
}

interface CongressBillDetail {
  bill: {
    sponsors: Array<{ firstName: string; lastName: string; fullName?: string }>;
    subjects?: { legislativeSubjects: Array<{ name: string }> };
    summaries?: Array<{ text: string }>;
  };
}

interface CongressResponse {
  bills: CongressBill[];
  pagination?: { count: number; next?: string };
}

// Recent congresses + relevant policy areas/subjects
const CONGRESS_NUMBERS = [119, 118];
const BILL_TYPES = ['hr', 's'];

// Known PFAS / environmental bill numbers to track directly
const KNOWN_BILLS = [
  // 119th Congress (current)
  { congress: 119, type: 'hr', number: 3184 },  // PFAS Alternatives Act
  { congress: 119, type: 'hr', number: 7384 },  // Toxic Substances - hydrogen fluoride
  { congress: 119, type: 'hr', number: 588 },   // Boundary Waters Pollution Prevention
  { congress: 119, type: 's', number: 3598 },   // Better Care for PFAS Patients Act 2026
  { congress: 119, type: 's', number: 3796 },   // Federal Water Pollution Control - Ohio River
  { congress: 119, type: 's', number: 3446 },   // DoD PFAS response strategy
  { congress: 119, type: 's', number: 1430 },   // Water Systems PFAS Liability Protection
  { congress: 119, type: 's', number: 25 },     // Polluters Pay Climate Fund Act
];

export class CongressCollector extends BaseCollector {
  readonly name = 'congress';

  protected async collect(): Promise<{ found: number; new: number }> {
    if (!config.congressApiKey) {
      logger.warn('Congress API key not configured, skipping');
      return { found: 0, new: 0 };
    }

    let totalFound = 0;
    let totalNew = 0;

    const insertBill = this.db.prepare(`
      INSERT INTO legislation (source, external_id, bill_number, title, summary, status, chamber, sponsor, introduced_date, last_action_date, url, relevance_score, keywords_matched, government_level, jurisdiction)
      VALUES ('congress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'federal', 'US')
      ON CONFLICT(source, external_id) DO UPDATE SET
        status = excluded.status,
        last_action_date = excluded.last_action_date,
        relevance_score = excluded.relevance_score,
        summary = COALESCE(excluded.summary, legislation.summary),
        sponsor = COALESCE(excluded.sponsor, legislation.sponsor),
        government_level = 'federal',
        jurisdiction = 'US',
        updated_at = datetime('now')
    `);

    const insertHistory = this.db.prepare(`
      INSERT INTO legislation_history (legislation_id, status, description, action_date)
      VALUES (?, ?, ?, ?)
    `);

    const findBill = this.db.prepare(
      `SELECT id, status FROM legislation WHERE source = 'congress' AND external_id = ?`
    );

    // Strategy 1: Fetch recent bills from relevant policy areas and filter client-side
    for (const congress of CONGRESS_NUMBERS) {
      for (const billType of BILL_TYPES) {
        try {
          // Fetch recent bills (sorted by latest action) and keyword-filter
          const data = await this.fetchRecentBills(congress, billType);
          if (!data.bills) continue;

          for (const bill of data.bills) {
            const text = `${bill.title} ${bill.policyArea?.name || ''}`;
            const { score, matchedKeywords } = matchKeywords(text);

            // Also check title for broader environmental terms
            const titleLower = bill.title.toLowerCase();
            const broadMatch = ['pfas', 'perfluor', 'forever chem', 'contaminant', 'superfund',
              'clean water', 'drinking water', 'water pollution', 'toxic sub', 'hazardous sub',
              'environmental remediat', 'environmental test', 'water quality'].some(k => titleLower.includes(k));

            // Only store relevant bills
            if (score <= 0 && !broadMatch) continue;
            const finalScore = broadMatch && score === 0 ? 0.3 : score;

            totalFound++;
            const newId = this.upsertBill(bill, finalScore, matchedKeywords, insertBill, findBill, insertHistory);
            if (newId) {
              totalNew++;
              this.insertTopicItems('legislation', newId, text);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`Congress fetch [${congress}/${billType}] failed: ${msg}`);
        }
      }
    }

    // Strategy 2: Directly fetch known PFAS bills
    for (const known of KNOWN_BILLS) {
      try {
        const detail = await this.fetchBillDetail(known.congress, known.type, known.number);
        if (!detail) continue;

        // Build a synthetic bill object from detail
        const bill = detail as any;
        if (!bill.bill) continue;

        const b = bill.bill;
        const title = b.title || '';
        const text = `${title} ${b.policyArea?.name || ''} ${(b.subjects?.legislativeSubjects || []).map((s: any) => s.name).join(' ')}`;
        const { score, matchedKeywords } = matchKeywords(text);
        const finalScore = Math.max(score, 0.5); // Known bills get minimum 0.5

        totalFound++;

        const billNumber = `${known.type.toUpperCase()}${known.number}`;
        const externalId = `${known.congress}-${billNumber}`;
        const status = this.parseStatus(b.latestAction?.text || '');
        const sponsor = b.sponsors?.[0]
          ? (b.sponsors[0].fullName || `${b.sponsors[0].firstName} ${b.sponsors[0].lastName}`)
          : null;
        const summary = b.summaries?.[0]?.text?.replace(/<[^>]*>/g, '').slice(0, 500) || null;

        const existing = findBill.get(externalId) as { id: number; status: string } | undefined;

        const chamberPath = b.originChamber?.toLowerCase() === 'senate' ? 'senate-bill' : 'house-bill';
        const result = insertBill.run(
          externalId, billNumber, title, summary, status,
          b.originChamber || null, sponsor,
          b.introducedDate || null,
          b.latestAction?.actionDate || null,
          `https://www.congress.gov/bill/${known.congress}th-congress/${chamberPath}/${known.number}`,
          finalScore,
          matchedKeywords.length > 0 ? JSON.stringify(matchedKeywords) : null
        );

        const isNew = result.changes > 0 && !existing;
        if (isNew) {
          totalNew++;
          const row = findBill.get(externalId) as { id: number } | undefined;
          if (row) this.insertTopicItems('legislation', row.id, text);
        }

        if (existing && existing.status !== status) {
          insertHistory.run(existing.id, status, b.latestAction?.text || null, b.latestAction?.actionDate || null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Known bill [${known.congress}/${known.type}${known.number}] failed: ${msg}`);
      }
    }

    return { found: totalFound, new: totalNew };
  }

  private upsertBill(
    bill: CongressBill, score: number, matchedKeywords: string[],
    insertBill: any, findBill: any, insertHistory: any
  ): number | null {
    const billNumber = `${bill.type}${bill.number}`;
    const externalId = `${bill.congress}-${billNumber}`;
    const status = this.parseStatus(bill.latestAction?.text || '');

    const existing = findBill.get(externalId) as { id: number; status: string } | undefined;

    const chamberCode = bill.originChamberCode?.toLowerCase() || '';
    const chamberPath = chamberCode === 's' ? 'senate-bill' : 'house-bill';

    const result = insertBill.run(
      externalId, billNumber, bill.title, null, status,
      bill.originChamber || null, null,
      bill.introducedDate || null,
      bill.latestAction?.actionDate || null,
      `https://www.congress.gov/bill/${bill.congress}th-congress/${chamberPath}/${bill.number}`,
      score,
      matchedKeywords.length > 0 ? JSON.stringify(matchedKeywords) : null
    );

    if (existing && existing.status !== status) {
      insertHistory.run(existing.id, status, bill.latestAction?.text || null, bill.latestAction?.actionDate || null);
    }

    if (result.changes > 0 && !existing) return Number(result.lastInsertRowid);
    return null;
  }

  private parseStatus(actionText: string): string {
    const lower = actionText.toLowerCase();
    if (lower.includes('became public law') || lower.includes('signed by president')) return 'signed';
    if (lower.includes('passed house') || lower.includes('passed senate')) return 'passed_chamber';
    if (lower.includes('reported by') || lower.includes('ordered reported')) return 'passed_committee';
    if (lower.includes('referred to')) return 'in_committee';
    return 'introduced';
  }

  private fetchRecentBills(congress: number, billType: string): Promise<CongressResponse> {
    const params = new URLSearchParams({
      limit: '250',
      sort: 'updateDate+desc',
      api_key: config.congressApiKey,
    });

    return new Promise((resolve, reject) => {
      const url = `https://api.congress.gov/v3/bill/${congress}/${billType}?${params}`;
      https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Invalid JSON from Congress.gov')); }
        });
      }).on('error', reject);
    });
  }

  private fetchBillDetail(congress: number, billType: string, billNumber: number): Promise<any> {
    const params = new URLSearchParams({ api_key: config.congressApiKey });

    return new Promise((resolve, reject) => {
      const url = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?${params}`;
      https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Invalid JSON from Congress.gov bill detail')); }
        });
      }).on('error', reject);
    });
  }
}
