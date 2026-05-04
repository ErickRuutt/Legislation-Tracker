export function extractRequiredTokens(query: string): string[] {
  const tokens: string[] = [];
  const years = query.match(/\b(19|20)\d{2}\b/g) || [];
  tokens.push(...years);

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const monthPattern = new RegExp(
    `\\b(${months.join('|')})\\s+\\d{1,2}(?:,\\s*\\d{4})?`,
    'gi'
  );
  const monthMatches = query.match(monthPattern) || [];
  tokens.push(...monthMatches);

  const numericDates = query.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || [];
  tokens.push(...numericDates);

  return Array.from(new Set(tokens.map((t) => t.trim()))).filter(Boolean);
}

export function extractCountTokens(query: string): string[] {
  const lower = query.toLowerCase();
  if (!(lower.includes('how many') || lower.includes('number of'))) return [];

  const numeric = query.match(/\b\d+\b/g) || [];
  const spelled = [
    'one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  ];
  return Array.from(new Set([...numeric, ...spelled]));
}
