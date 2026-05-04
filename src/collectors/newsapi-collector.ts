import https from 'https';
import crypto from 'crypto';
import { BaseCollector } from './base-collector';
import { matchKeywords, detectRegion } from '../analysis/keyword-matcher';
import { recordArticleLegislationMentions } from '../analysis/legislation-mentions';
import { config } from '../shared/config';
import { logger } from '../shared/logger';

interface NewsApiArticle {
  title: string;
  description: string | null;
  content: string | null;
  author: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: { name: string };
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

const QUERIES = [
  'PFAS contamination',
  'forever chemicals',
  'water testing regulation',
  'mold remediation',
  'environmental testing',
];

export class NewsApiCollector extends BaseCollector {
  readonly name = 'newsapi';

  protected async collect(): Promise<{ found: number; new: number }> {
    if (!config.newsApiKey) {
      logger.warn('NewsAPI key not configured, skipping');
      return { found: 0, new: 0 };
    }

    let totalFound = 0;
    let totalNew = 0;

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO articles (source, external_id, title, description, content, author, url, image_url, published_at, region, relevance_score, keywords_matched)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const query of QUERIES) {
      try {
        const data = await this.fetchApi(query);
        if (data.status !== 'ok') continue;

        totalFound += data.articles.length;

        for (const article of data.articles) {
          if (!article.title || !article.url) continue;

          const text = `${article.title} ${article.description || ''} ${article.content || ''}`;
          const { score, matchedKeywords } = matchKeywords(text);
          const region = detectRegion(text);

          const externalId = crypto
            .createHash('md5')
            .update(article.url)
            .digest('hex');

          const result = insertStmt.run(
            `newsapi:${article.source.name}`,
            externalId,
            article.title,
            article.description,
            article.content,
            article.author,
            article.url,
            article.urlToImage,
            article.publishedAt,
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`NewsAPI query [${query}] failed: ${msg}`);
      }
    }

    return { found: totalFound, new: totalNew };
  }

  private fetchApi(query: string): Promise<NewsApiResponse> {
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '20',
      apiKey: config.newsApiKey,
    });

    return new Promise((resolve, reject) => {
      const url = `https://newsapi.org/v2/everything?${params}`;
      https.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', reject);
    });
  }
}
