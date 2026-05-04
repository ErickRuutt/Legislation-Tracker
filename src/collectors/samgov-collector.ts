import https from 'https';
import { BaseCollector } from './base-collector';
import { matchKeywords } from '../analysis/keyword-matcher';
import { config } from '../shared/config';
import { NAICS_CODES } from '../shared/constants';
import { logger } from '../shared/logger';

interface SamOpportunity {
  noticeId: string;
  title: string;
  description?: string;
  department?: string;
  office?: string;
  naicsCode?: string;
  setAside?: string;
  responseDeadLine?: string;
  postedDate?: string;
  uiLink?: string;
}

interface SamResponse {
  totalRecords: number;
  opportunitiesData: SamOpportunity[];
}

const SEARCH_KEYWORDS = [
  'PFAS',
  'environmental testing',
  'water testing',
  'mold remediation',
  'environmental remediation',
  'groundwater',
  'soil contamination',
];

export class SamGovCollector extends BaseCollector {
  readonly name = 'samgov';

  protected async collect(): Promise<{ found: number; new: number }> {
    if (!config.samGovApiKey) {
      logger.warn('SAM.gov API key not configured, skipping');
      return { found: 0, new: 0 };
    }

    let totalFound = 0;
    let totalNew = 0;

    const insertStmt = this.db.prepare(`
      INSERT INTO contracts (notice_id, title, description, agency, office, naics_code, set_aside, response_deadline, posted_date, url, relevance_score, keywords_matched)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(notice_id) DO UPDATE SET
        title = excluded.title,
        response_deadline = excluded.response_deadline,
        relevance_score = excluded.relevance_score,
        updated_at = datetime('now')
    `);

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        const data = await this.fetchOpportunities(keyword);
        if (!data.opportunitiesData) continue;

        totalFound += data.opportunitiesData.length;

        for (const opp of data.opportunitiesData) {
          const text = `${opp.title} ${opp.description || ''}`;
          const { score, matchedKeywords } = matchKeywords(text);

          // Boost score for relevant NAICS codes
          const naicsValues = Object.values(NAICS_CODES);
          const naicsBoost = opp.naicsCode && naicsValues.includes(opp.naicsCode) ? 0.2 : 0;
          const finalScore = Math.min(score + naicsBoost, 1.0);

          const result = insertStmt.run(
            opp.noticeId,
            opp.title,
            opp.description || null,
            opp.department || null,
            opp.office || null,
            opp.naicsCode || null,
            opp.setAside || null,
            opp.responseDeadLine || null,
            opp.postedDate || null,
            opp.uiLink || `https://sam.gov/opp/${opp.noticeId}/view`,
            finalScore,
            matchedKeywords.length > 0 ? JSON.stringify(matchedKeywords) : null
          );

          if (result.changes > 0) {
            totalNew++;
            if (result.lastInsertRowid) {
              this.insertTopicItems('contract', Number(result.lastInsertRowid), text);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`SAM.gov search [${keyword}] failed: ${msg}`);
      }
    }

    return { found: totalFound, new: totalNew };
  }

  private fetchOpportunities(keyword: string): Promise<SamResponse> {
    const params = new URLSearchParams({
      api_key: config.samGovApiKey,
      q: keyword,
      limit: '25',
      postedFrom: this.getDateOffset(30),
      postedTo: this.getToday(),
    });

    return new Promise((resolve, reject) => {
      const url = `https://api.sam.gov/opportunities/v2/search?${params}`;
      https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON from SAM.gov'));
          }
        });
      }).on('error', reject);
    });
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0].replace(/-/g, '/');
  }

  private getDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0].replace(/-/g, '/');
  }
}
