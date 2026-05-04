import Parser from 'rss-parser';
import crypto from 'crypto';
import { BaseCollector } from './base-collector';
import { matchKeywords, detectRegion } from '../analysis/keyword-matcher';
import { recordArticleLegislationMentions } from '../analysis/legislation-mentions';
import { NEWS_RSS_FEEDS } from '../shared/constants';
import { logger } from '../shared/logger';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'PFAS-Monitor/1.0',
  },
});

export class GoogleNewsCollector extends BaseCollector {
  readonly name = 'google_news';

  protected async collect(): Promise<{ found: number; new: number }> {
    let totalFound = 0;
    let totalNew = 0;

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO articles (source, external_id, title, description, url, published_at, region, relevance_score, keywords_matched)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const feed of NEWS_RSS_FEEDS) {
      try {
        const result = await parser.parseURL(feed.url);
        const items = result.items || [];
        totalFound += items.length;

        for (const item of items) {
          if (!item.title || !item.link) continue;

          const text = `${item.title} ${item.contentSnippet || ''}`;
          const { score, matchedKeywords } = matchKeywords(text);
          const region = detectRegion(text);

          const externalId = crypto
            .createHash('md5')
            .update(item.link)
            .digest('hex');

          const pubDate = item.pubDate
            ? new Date(item.pubDate).toISOString()
            : null;

          const result = insertStmt.run(
            feed.name,
            externalId,
            item.title,
            item.contentSnippet || null,
            item.link,
            pubDate,
            region,
            score,
            matchedKeywords.length > 0 ? JSON.stringify(matchedKeywords) : null
          );

          if (result.changes > 0) {
            totalNew++;
            if (result.lastInsertRowid) {
              const articleId = Number(result.lastInsertRowid);
              recordArticleLegislationMentions(articleId, text);
              this.insertTopicItems('article', articleId, text);
            }
          }
        }

        logger.info(`Feed [${feed.name}] processed: ${items.length} items`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Feed [${feed.name}] failed: ${msg}`);
      }
    }

    return { found: totalFound, new: totalNew };
  }
}
