import crypto from 'crypto';
import { getDb } from '../db/connection';

const STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC'
};

const FEDERAL_PATTERNS = [
  /\bH\.R\.\s*\d+\b/gi,
  /\bS\.\s*\d+\b/gi,
  /\bH\.J\.\s*Res\.\s*\d+\b/gi,
  /\bS\.J\.\s*Res\.\s*\d+\b/gi,
];

const STATE_PATTERNS = [
  /\bHB\s*\d+\b/gi,
  /\bSB\s*\d+\b/gi,
  /\bAB\s*\d+\b/gi,
  /\bH\.B\.\s*\d+\b/gi,
  /\bS\.B\.\s*\d+\b/gi,
  /\bHB\s*\d+-\d+\b/gi,
  /\bSB\s*\d+-\d+\b/gi,
  /\bSenate Bill\s*\d+\b/gi,
  /\bHouse Bill\s*\d+\b/gi,
  /\b([A-Z]{2})\s*(SB|HB|AB)\s*\d+\b/g,
  /\b(SB|HB|AB)\s*\d+\s*\([A-Z]{2}\)\b/g,
];

export function extractBillMentions(text: string): Array<{ billNumber: string; jurisdiction: string | null; mentionText: string }> {
  if (!text) return [];
  const lower = text.toLowerCase();
  const mentions: Array<{ billNumber: string; jurisdiction: string | null; mentionText: string }> = [];

  const stateCodes: string[] = [];
  for (const [name, code] of Object.entries(STATE_MAP)) {
    if (lower.includes(name)) stateCodes.push(code);
  }
  const codeMatches = matchStateCodes(text);
  for (const code of codeMatches) stateCodes.push(code);

  for (const pattern of FEDERAL_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      mentions.push({ billNumber: m.trim().replace(/\s+/g, ' '), jurisdiction: 'FED', mentionText: snippet(text, m) });
    }
  }

  for (const pattern of STATE_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const billNumber = normalizeBillNumber(m);
      const jurisdiction = inferJurisdiction(text, m) || stateCodes[0] || null;
      mentions.push({ billNumber, jurisdiction, mentionText: snippet(text, m) });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.billNumber}|${m.jurisdiction || 'UNK'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function recordArticleLegislationMentions(articleId: number, text: string): void {
  const db = getDb();
  const mentions = extractBillMentions(text);
  if (mentions.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO article_legislation_mentions
      (id, article_id, legislation_id, bill_number, jurisdiction, mention_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const mention of mentions) {
    const legislationId = findLegislationId(db, mention.billNumber, mention.jurisdiction);
    insert.run(
      crypto.randomUUID(),
      articleId,
      legislationId,
      mention.billNumber,
      mention.jurisdiction,
      mention.mentionText
    );
  }
}

export function backfillArticleMentions(limit = 500): { processed: number; mentions: number } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, title, description, content
    FROM articles
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: number; title: string; description: string | null; content: string | null }>;

  let processed = 0;
  let mentions = 0;

  for (const row of rows) {
    const text = `${row.title} ${row.description || ''} ${row.content || ''}`;
    const before = countMentionsForArticle(db, row.id);
    recordArticleLegislationMentions(row.id, text);
    const after = countMentionsForArticle(db, row.id);
    processed++;
    mentions += Math.max(0, after - before);
  }

  return { processed, mentions };
}

function findLegislationId(db: ReturnType<typeof getDb>, billNumber: string, jurisdiction: string | null): number | null {
  if (jurisdiction === 'FED') {
    const row = db.prepare('SELECT id FROM legislation WHERE source = ? AND bill_number = ?').get('congress', billNumber) as any;
    return row?.id || null;
  }
  if (jurisdiction === 'WA') {
    const row = db.prepare('SELECT id FROM legislation WHERE source = ? AND bill_number = ?').get('wa_legislature', billNumber) as any;
    return row?.id || null;
  }
  if (jurisdiction === 'OR') {
    const row = db.prepare('SELECT id FROM legislation WHERE source = ? AND bill_number = ?').get('or_legislature', billNumber) as any;
    return row?.id || null;
  }
  return null;
}

function snippet(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return term;
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + term.length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function matchStateCodes(text: string): string[] {
  const matches: string[] = [];
  const codePattern = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/g;
  let match;
  while ((match = codePattern.exec(text)) !== null) {
    const code = match[1];
    if (code === 'OR') continue; // avoid false positives with "or"
    matches.push(code);
  }
  return matches;
}

function countMentionsForArticle(db: ReturnType<typeof getDb>, articleId: number): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM article_legislation_mentions WHERE article_id = ?').get(articleId) as any;
  return row?.c || 0;
}

function normalizeBillNumber(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\(([A-Z]{2})\)/g, '')
    .trim();
}

function inferJurisdiction(text: string, match: string): string | null {
  const window = snippet(text, match);
  const lower = window.toLowerCase();
  for (const [name, code] of Object.entries(STATE_MAP)) {
    if (lower.includes(name)) return code;
  }
  const codes = matchStateCodes(window);
  if (codes.length > 0) return codes[0];
  return null;
}
