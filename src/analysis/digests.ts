import crypto from 'crypto';
import { getDb } from '../db/connection';
import { chatCompletion } from '../shared/openai';
import { logger } from '../shared/logger';
import { enrichRecentArticles } from './article-fulltext';

export type DigestPeriod = 'daily' | 'weekly' | 'monthly';

function getSinceDate(period: DigestPeriod): string {
  const now = new Date();
  if (period === 'daily') now.setDate(now.getDate() - 1);
  if (period === 'weekly') now.setDate(now.getDate() - 7);
  if (period === 'monthly') now.setDate(now.getDate() - 30);
  return now.toISOString();
}

export async function generateNewsDigest(period: DigestPeriod): Promise<{ outputId: string; markdown: string }> {
  const db = getDb();
  const since = getSinceDate(period);
  await enrichRecentArticles(30);

  const rowsWithContent = db.prepare(`
    SELECT source, title, description, content, summary_text, url, published_at, region, relevance_score
    FROM articles
    WHERE published_at IS NOT NULL
      AND published_at >= ?
    ORDER BY relevance_score DESC, published_at DESC
    LIMIT 40
  `).all(since) as Array<{
    source: string;
    title: string;
    description: string | null;
    content: string | null;
    summary_text: string | null;
    url: string;
    published_at: string;
    region: string | null;
    relevance_score: number;
  }>;

  if (rowsWithContent.length === 0) {
    const outputId = crypto.randomUUID();
    const empty = `No relevant news items were found for the ${period} digest.`;
    db.prepare(`
      INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
      VALUES (?, 'weekly_digest', ?, ?, ?)
    `).run(outputId, `digest:${period}`, empty, JSON.stringify({ period, count: 0 }));
    return { outputId, markdown: empty };
  }

  const context = rowsWithContent.map((r, idx) => {
    const date = r.published_at?.split('T')[0] || 'unknown';
    const region = r.region || 'National';
    const raw = r.summary_text || r.content || r.description || '';
    const desc = raw.replace(/\s+/g, ' ').slice(0, 500);
    return `${idx + 1}. [${date}] (${region}) ${r.title} — ${r.source}\n${desc}\n${r.url}`;
  }).join('\n\n');

  const systemPrompt = `You are a policy and environmental intelligence analyst. Produce a concise, evidence-grounded digest for a newsletter audience. Use only the provided items. Do not add external facts. Be crisp.`;

  const userPrompt = `Create a ${period} digest with this structure:
1. TL;DR (3 bullets)
2. Top Signals (5 bullets, each with a source link)
3. PNW Focus (WA/OR/PNW items only, 3 bullets)
4. Causal Threads (2 bullets linking research -> policy -> market where evidence supports it)
5. Opportunities (2 bullets for lead-gen or testing services)
6. Data Appendix (count of items, top sources)

Items:
${context}`;

  logger.info(`Generating ${period} digest from ${rowsWithContent.length} items`);
  const response = await chatCompletion(systemPrompt, userPrompt, { maxTokens: 1800 });

  const outputId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
    VALUES (?, 'weekly_digest', ?, ?, ?)
  `).run(outputId, `digest:${period}`, response, JSON.stringify({ period, count: rowsWithContent.length }));

  return { outputId, markdown: response };
}

export function getLatestDigest(period: DigestPeriod): { id: string; response_markdown: string; created_at: string } | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, response_markdown, created_at
    FROM research_outputs
    WHERE output_type = 'weekly_digest'
      AND json_extract(metadata_json, '$.period') = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(period) as any;
  return row || null;
}
