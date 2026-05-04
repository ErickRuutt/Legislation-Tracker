import { PFAS_KEYWORDS } from '../shared/constants';

interface MatchResult {
  score: number;
  matchedKeywords: string[];
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  primary: 1.0,
  environmental: 0.6,
  testing: 0.7,
  regulatory: 0.8,
  regional: 0.4,
};

export function matchKeywords(text: string): MatchResult {
  if (!text) return { score: 0, matchedKeywords: [] };

  const lower = text.toLowerCase();
  const matchedKeywords: string[] = [];
  let totalWeight = 0;

  for (const [category, keywords] of Object.entries(PFAS_KEYWORDS)) {
    const weight = CATEGORY_WEIGHTS[category] || 0.5;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        totalWeight += weight;
      }
    }
  }

  // Normalize score to 0-1 range, cap at 1.0
  const score = Math.min(totalWeight / 3, 1.0);

  return { score: Math.round(score * 100) / 100, matchedKeywords };
}

export function isRelevant(text: string, threshold = 0.1): boolean {
  return matchKeywords(text).score >= threshold;
}

export function detectRegion(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('washington') || lower.includes('seattle') || lower.includes('tacoma') ||
      lower.includes('olympia') || lower.includes('puget sound') || lower.includes('bellingham')) {
    return 'WA';
  }
  if (lower.includes('oregon') || lower.includes('portland') || lower.includes('eugene') ||
      lower.includes('columbia river')) {
    return 'OR';
  }
  if (lower.includes('pacific northwest') || lower.includes('pnw')) {
    return 'PNW';
  }
  return null;
}
