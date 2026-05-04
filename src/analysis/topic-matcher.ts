import { getDb } from '../db/connection';

interface TopicRow {
  id: number;
  name: string;
  slug: string;
  keywords_json: string;
  category_weights_json: string;
}

interface TopicCache {
  topics: Array<{
    id: number;
    name: string;
    slug: string;
    categories: Record<string, string[]>;
    weights: Record<string, number>;
  }>;
  loadedAt: number;
}

interface TopicMatch {
  topicId: number;
  topicName: string;
  topicSlug: string;
  score: number;
  matchedKeywords: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_SCORE = 0.05;

let cache: TopicCache | null = null;

function loadTopicCache(): TopicCache {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, slug, keywords_json, category_weights_json FROM topics WHERE active = 1'
  ).all() as TopicRow[];

  return {
    topics: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      categories: JSON.parse(row.keywords_json || '{}'),
      weights: JSON.parse(row.category_weights_json || '{}'),
    })),
    loadedAt: Date.now(),
  };
}

function getCache(): TopicCache {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = loadTopicCache();
  }
  return cache;
}

export function invalidateTopicCache(): void {
  cache = null;
}

export function matchTopics(text: string): TopicMatch[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const { topics } = getCache();
  const results: TopicMatch[] = [];

  for (const topic of topics) {
    const matchedKeywords: string[] = [];
    let totalWeight = 0;

    for (const [category, keywords] of Object.entries(topic.categories)) {
      const weight = topic.weights[category] ?? 0.5;
      for (const keyword of keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          totalWeight += weight;
        }
      }
    }

    const score = Math.min(Math.round((totalWeight / 3) * 100) / 100, 1.0);
    if (score >= MIN_SCORE) {
      results.push({ topicId: topic.id, topicName: topic.name, topicSlug: topic.slug, score, matchedKeywords });
    }
  }

  return results;
}

export function topicScoreForSlug(text: string, slug: string): number {
  const matches = matchTopics(text);
  return matches.find((m) => m.topicSlug === slug)?.score ?? 0;
}
