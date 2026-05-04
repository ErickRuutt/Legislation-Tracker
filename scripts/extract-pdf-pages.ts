import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'data/test-exports');

const KEYWORDS = [
  'PFAS',
  'AFFF',
  'EIS',
  'Washington',
  'WA',
  'Ecology',
  'cleanup',
  'clean up',
  'community',
  'testing',
  'test',
  'timeline',
  'deadline',
  'mandate',
  'plan',
  'regulation',
  'policy',
  'water',
  'drinking water',
  'stormwater',
  'biosolids',
  'sampling',
  'impact',
  'elevated',
  'elevated levels',
  '2025',
  '2026',
  '2027',
];

// Per-page extraction now handled by pdf-parse pagerender; no synthetic splitting needed.

async function extractPdfText(filePath: string): Promise<{ pages: string[]; numpages: number }> {
  const buffer = fs.readFileSync(filePath);
  const pages: string[] = [];

  const data = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      pages.push(text);
      return text;
    },
  });

  if (pages.length === 0 && data.text) {
    return { pages: [data.text], numpages: data.numpages || 1 };
  }

  return { pages, numpages: data.numpages || pages.length };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: tsx scripts/extract-pdf-pages.ts <pdfPath> [more...]');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const filePath of files) {
    const base = path.basename(filePath, path.extname(filePath));
    console.log(`Extracting: ${base}`);
    const { pages, numpages } = await extractPdfText(filePath);

    const keywordHits: Record<string, number[]> = {};
    for (const kw of KEYWORDS) keywordHits[kw] = [];

    pages.forEach((page, idx) => {
      KEYWORDS.forEach((kw) => {
        if (page.toLowerCase().includes(kw.toLowerCase())) {
          keywordHits[kw].push(idx + 1);
        }
      });
    });

    const out = {
      filePath,
      title: base,
      numpages,
      pageCount: pages.length,
      keywords: keywordHits,
      pages,
    };

    const outPath = path.join(OUT_DIR, `${base}.pages.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`Wrote ${outPath} (${pages.length} pages)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
