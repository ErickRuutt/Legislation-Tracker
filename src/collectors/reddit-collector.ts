import https from 'https';
import { BaseCollector } from './base-collector';
import { matchKeywords } from '../analysis/keyword-matcher';
import { config } from '../shared/config';
import { REDDIT_SUBREDDITS, ALL_KEYWORDS } from '../shared/constants';
import { logger } from '../shared/logger';

interface RedditPost {
  id: string;
  subreddit: string;
  author: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

interface RedditResponse {
  data: {
    children: Array<{ data: RedditPost }>;
    after: string | null;
  };
}

export class RedditCollector extends BaseCollector {
  readonly name = 'reddit';
  private accessToken: string | null = null;

  protected async collect(): Promise<{ found: number; new: number }> {
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      logger.warn('Reddit credentials not configured, skipping');
      return { found: 0, new: 0 };
    }

    await this.authenticate();
    if (!this.accessToken) {
      throw new Error('Failed to authenticate with Reddit');
    }

    let totalFound = 0;
    let totalNew = 0;

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO social_posts (platform, external_id, subreddit, author, title, body, url, score, num_comments, relevance_score, keywords_matched, posted_at)
      VALUES ('reddit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const subreddit of REDDIT_SUBREDDITS) {
      try {
        const posts = await this.fetchSubreddit(subreddit);
        totalFound += posts.length;

        for (const post of posts) {
          const text = `${post.title} ${post.selftext}`;
          const { score: relevance, matchedKeywords } = matchKeywords(text);

          // Only store posts with some relevance
          if (relevance < 0.05) continue;

          const postedAt = new Date(post.created_utc * 1000).toISOString();

          const result = insertStmt.run(
            post.id,
            post.subreddit,
            post.author,
            post.title,
            post.selftext || null,
            `https://reddit.com${post.permalink}`,
            post.score,
            post.num_comments,
            relevance,
            matchedKeywords.length > 0 ? JSON.stringify(matchedKeywords) : null,
            postedAt
          );

          if (result.changes > 0) {
            totalNew++;
            if (result.lastInsertRowid) {
              this.insertTopicItems('social_post', Number(result.lastInsertRowid), text);
            }
          }
        }

        logger.info(`Subreddit [${subreddit}] processed: ${posts.length} posts`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Subreddit [${subreddit}] failed: ${msg}`);
      }
    }

    // Update daily stats
    this.updateDailyStats();

    return { found: totalFound, new: totalNew };
  }

  private async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(
        `${config.reddit.clientId}:${config.reddit.clientSecret}`
      ).toString('base64');

      const postData = `grant_type=password&username=${encodeURIComponent(config.reddit.username)}&password=${encodeURIComponent(config.reddit.password)}`;

      const req = https.request(
        {
          hostname: 'www.reddit.com',
          path: '/api/v1/access_token',
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'PFAS-Monitor/1.0',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              this.accessToken = data.access_token || null;
              resolve();
            } catch {
              reject(new Error('Failed to parse Reddit auth response'));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private fetchSubreddit(subreddit: string): Promise<RedditPost[]> {
    return new Promise((resolve, reject) => {
      // Search for PFAS-related keywords in the subreddit
      const searchTerms = ['PFAS', 'water contamination', 'mold', 'environmental testing', 'forever chemicals'];
      const query = searchTerms.join(' OR ');

      const path = `/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=25&t=week`;

      https.get(
        {
          hostname: 'oauth.reddit.com',
          path,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': 'PFAS-Monitor/1.0',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data: RedditResponse = JSON.parse(body);
              resolve(data.data.children.map((c) => c.data));
            } catch {
              reject(new Error(`Invalid JSON from Reddit /r/${subreddit}`));
            }
          });
        }
      ).on('error', reject);
    });
  }

  private updateDailyStats(): void {
    const today = new Date().toISOString().split('T')[0];

    this.db.prepare(`
      INSERT INTO social_daily_stats (platform, subreddit, date, post_count, comment_count, avg_score, avg_sentiment, top_keywords)
      SELECT
        'reddit',
        subreddit,
        date(posted_at) as date,
        COUNT(*) as post_count,
        SUM(num_comments) as comment_count,
        AVG(score) as avg_score,
        AVG(sentiment) as avg_sentiment,
        NULL
      FROM social_posts
      WHERE platform = 'reddit' AND date(posted_at) = ?
      GROUP BY subreddit
      ON CONFLICT(platform, subreddit, date) DO UPDATE SET
        post_count = excluded.post_count,
        comment_count = excluded.comment_count,
        avg_score = excluded.avg_score,
        avg_sentiment = excluded.avg_sentiment
    `).run(today);
  }
}
