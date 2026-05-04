import crypto from 'crypto';
import { getDb } from '../db/connection';
import { chatCompletion } from '../shared/openai';
import { searchResearchCorpus } from './search';
import { logger } from '../shared/logger';
import { extractRequiredTokens, extractCountTokens } from './query-tokens';

interface Citation {
  label: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  pageNumber: number;
  sourceUrl: string | null;
  chunkText?: string;
}

interface GenerationResult {
  outputId: string;
  markdown: string;
  citations: Citation[];
}

function buildChunkContext(chunks: Array<{
  chunkId: string;
  chunkText: string;
  documentTitle: string;
  documentId: string;
  pageNumber: number;
  sourceUrl: string | null;
}>): { contextBlock: string; citationMap: Map<string, Citation> } {
  const citationMap = new Map<string, Citation>();
  const contextParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const label = `D${i + 1} p.${c.pageNumber}`;
    citationMap.set(label, {
      label,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      chunkId: c.chunkId,
      pageNumber: c.pageNumber,
      sourceUrl: c.sourceUrl,
      chunkText: c.chunkText,
    });

    contextParts.push(
      `--- [${label}] "${c.documentTitle}" ---\n${c.chunkText}\n`
    );
  }

  return { contextBlock: contextParts.join('\n'), citationMap };
}

function storeCitations(db: ReturnType<typeof getDb>, outputId: string, citations: Citation[]): void {
  const stmt = db.prepare(`
    INSERT INTO research_output_citations (id, output_id, citation_type, document_id, chunk_id, page_number, source_url, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const c of citations) {
      stmt.run(
        crypto.randomUUID(),
        outputId,
        c.sourceUrl ? 'web' : 'internal',
        c.documentId,
        c.chunkId,
        c.pageNumber,
        c.sourceUrl,
        c.label
      );
    }
  });

  insertAll();
}

// ==============================
// A) Document Summary (grounded)
// ==============================

export async function generateDocumentSummary(documentId: string): Promise<GenerationResult> {
  const db = getDb();

  const doc = db.prepare('SELECT id, title, source_url FROM research_documents WHERE id = ?').get(documentId) as any;
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  // Get all chunks for this document, ordered
  const chunks = db.prepare(`
    SELECT rc.id as chunkId, rc.chunk_text as chunkText, rc.page_number as pageNumber,
           rd.title as documentTitle, rd.id as documentId, rd.source_url as sourceUrl
    FROM research_chunks rc
    JOIN research_documents rd ON rd.id = rc.document_id
    WHERE rc.document_id = ?
    ORDER BY rc.page_number, rc.chunk_index
  `).all(documentId) as Array<{
    chunkId: string; chunkText: string; pageNumber: number;
    documentTitle: string; documentId: string; sourceUrl: string | null;
  }>;

  if (chunks.length === 0) throw new Error('No chunks found for this document');

  // If document is very large, sample chunks to keep cost down
  const maxChunks = 30;
  const selectedChunks = chunks.length > maxChunks
    ? sampleEvenly(chunks, maxChunks)
    : chunks;

  const { contextBlock, citationMap } = buildChunkContext(selectedChunks);

  const systemPrompt = `You are a research analyst specializing in PFAS (per- and polyfluoroalkyl substances) and environmental science. You produce grounded summaries of scientific documents.

Rules:
- Base ALL claims on the provided source chunks ONLY. Do not use external knowledge.
- Use inline citation markers like [D1 p.12] after each major claim.
- If you cannot determine something from the chunks, say so explicitly.
- Format output as markdown.`;

  const userPrompt = `Summarize the following document: "${doc.title}"

Produce:
1. **Abstract** (5-7 sentences summarizing the document)
2. **Key Findings** (bullet points, each with citation)
3. **Numeric Results** (any specific numbers, concentrations, statistics — with citations)
4. **Implications for PFAS Testing in PNW** (1 short paragraph on what this means for environmental testing businesses in the Pacific Northwest)

Source chunks:
${contextBlock}

Remember: cite every major claim with [D# p.#] markers.`;

  logger.info(`Generating summary for "${doc.title}" using ${selectedChunks.length} chunks`);
  const response = await chatCompletion(systemPrompt, userPrompt, { maxTokens: 3000 });

  // Store output
  const outputId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
    VALUES (?, 'doc_summary', ?, ?, ?)
  `).run(
    outputId,
    userPrompt.slice(0, 500),
    response,
    JSON.stringify({ documentId, chunksUsed: selectedChunks.length })
  );

  // Extract and store citations
  const usedCitations = extractUsedCitations(response, citationMap);
  storeCitations(db, outputId, usedCitations);

  return { outputId, markdown: response, citations: usedCitations };
}

// ==============================
// B) Q&A over corpus
// ==============================

export async function answerQuestionWithCitations(
  query: string,
  options?: { topK?: number; documentIds?: string[] }
): Promise<GenerationResult> {
  const db = getDb();
  const topK = options?.topK ?? 8;
  const subQueries = splitSubQueries(query);

  // Retrieve relevant chunks
  const primaryResults = await searchResearchCorpus(query, {
    topK: Math.max(topK * 3, 12),
    documentIds: options?.documentIds,
  });
  const supplementalResults: typeof primaryResults = [];

  for (const sq of subQueries) {
    if (sq === query) continue;
    const extra = await searchResearchCorpus(sq, {
      topK: Math.max(4, Math.floor(topK / 2)),
      documentIds: options?.documentIds,
    });
    supplementalResults.push(...extra);
  }

  const mergedMap = new Map<string, typeof primaryResults[0]>();
  for (const r of [...primaryResults, ...supplementalResults]) {
    if (!mergedMap.has(r.chunkId)) mergedMap.set(r.chunkId, r);
  }
  let searchResults = Array.from(mergedMap.values());

  if (searchResults.length === 0) {
    const outputId = crypto.randomUUID();
    const noResultsResponse = `I could not find any relevant information in the research corpus to answer this question.

**Suggestion:** Ingest more research documents related to this topic. You can use:
\`\`\`
npm run ingest:pdf -- --path "/path/to/relevant-paper.pdf" --title "Paper Title"
\`\`\``;

    db.prepare(`
      INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
      VALUES (?, 'qa_answer', ?, ?, ?)
    `).run(outputId, query, noResultsResponse, JSON.stringify({ topK, resultsFound: 0 }));

    return { outputId, markdown: noResultsResponse, citations: [] };
  }

  searchResults = await rerankChunksWithLLM(query, searchResults, topK);
  const { contextBlock, citationMap } = buildChunkContext(searchResults);

  const systemPrompt = `You are a research analyst specializing in PFAS (per- and polyfluoroalkyl substances) and environmental science. You answer questions using ONLY the provided source chunks.

Rules:
- Answer using ONLY information from the provided chunks. Do not use external knowledge.
- Use inline citation markers like [D1 p.12] after each claim.
- If the chunks don't contain enough information to fully answer, say so explicitly and suggest what additional documents might help.
- End your response with a "## Citations" section listing each citation used.
- Format: D# → Document Title — p.X (chunk_id: ...) [URL if available]`;

  const userPrompt = `Question: ${query}

Source chunks (ranked by relevance):
${contextBlock}

Answer the question using ONLY the above chunks. Include inline [D# p.#] citations and a Citations section at the end.`;

  logger.info(`Answering question with ${searchResults.length} chunks`);
  const response = await chatCompletion(systemPrompt, userPrompt, { maxTokens: 2500 });

  // Build citations section if model didn't include one
  const usedCitations = extractUsedCitations(response, citationMap);
  const filteredCitations = filterCitationsByQueryTokens(usedCitations, query);
  const countTokens = extractCountTokens(query);
  const countAligned = filterCitationsByCountTokens(filteredCitations, countTokens);

  if (filteredCitations.length === 0 && extractRequiredTokens(query).length > 0) {
    const outputId = crypto.randomUUID();
    const safeResponse = `I could not find cited passages that directly mention the date or specific time markers in your question.\n\nPlease try a narrower query or ingest documents that explicitly contain those dates.\n\n## Citations\nNone`;

    db.prepare(`
      INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
      VALUES (?, 'qa_answer', ?, ?, ?)
    `).run(
      outputId,
      query,
      safeResponse,
      JSON.stringify({ topK, resultsFound: searchResults.length, filteredOut: true })
    );

    return { outputId, markdown: safeResponse, citations: [] };
  }

  if (countTokens.length > 0 && countAligned.length === 0) {
    const outputId = crypto.randomUUID();
    const safeResponse = `I could not find a cited passage that clearly states the count you asked for. Please try a narrower query or check the source document directly.\n\n## Citations\nNone`;

    db.prepare(`
      INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
      VALUES (?, 'qa_answer', ?, ?, ?)
    `).run(
      outputId,
      query,
      safeResponse,
      JSON.stringify({ topK, resultsFound: searchResults.length, filteredOut: true })
    );

    return { outputId, markdown: safeResponse, citations: [] };
  }

  let finalResponse = response;
  if (!response.includes('## Citations') && filteredCitations.length > 0) {
    finalResponse += '\n\n## Citations\n';
    for (const c of filteredCitations) {
      finalResponse += `- **${c.label}** → ${c.documentTitle} — p.${c.pageNumber}`;
      if (c.sourceUrl) finalResponse += ` | [Source](${c.sourceUrl})`;
      finalResponse += '\n';
    }
  }

  // Store output
  const outputId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO research_outputs (id, output_type, prompt, response_markdown, metadata_json)
    VALUES (?, 'qa_answer', ?, ?, ?)
  `).run(
    outputId,
    query,
    finalResponse,
    JSON.stringify({
      topK,
      resultsFound: searchResults.length,
      topSimilarity: searchResults[0]?.similarity,
    })
  );

  storeCitations(db, outputId, filteredCitations);

  return { outputId, markdown: finalResponse, citations: filteredCitations };
}

// ==============================
// Helpers
// ==============================

function extractUsedCitations(text: string, citationMap: Map<string, Citation>): Citation[] {
  const used: Citation[] = [];
  const seen = new Set<string>();

  // Match patterns like [D1 p.12], [D2 p.3], etc.
  const pattern = /\[D\d+ p\.\d+\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const label = match[0].slice(1, -1); // Remove [ and ]
    if (!seen.has(label) && citationMap.has(label)) {
      used.push(citationMap.get(label)!);
      seen.add(label);
    }
  }

  return used;
}

function filterCitationsByQueryTokens(citations: Citation[], query: string): Citation[] {
  const tokens = extractRequiredTokens(query);
  if (tokens.length === 0) return citations;

  return citations.filter((c) => {
    const text = c.chunkText || '';
    const lower = text.toLowerCase();
    return tokens.some((t) => lower.includes(t.toLowerCase()));
  });
}

function filterCitationsByCountTokens(citations: Citation[], tokens: string[]): Citation[] {
  if (tokens.length === 0) return citations;
  return citations.filter((c) => {
    const text = (c.chunkText || '').toLowerCase();
    return tokens.some((t) => text.includes(t.toLowerCase()));
  });
}

function splitSubQueries(query: string): string[] {
  const parts = query.split(/\s+(?:and|&|plus|along with)\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [query];
  return [query, ...parts];
}

async function rerankChunksWithLLM<T extends {
  chunkId: string;
  chunkText: string;
  documentTitle: string;
  pageNumber: number;
}>(
  query: string,
  chunks: T[],
  topK: number
): Promise<T[]> {
  if (chunks.length <= topK) return chunks;

  const candidates = chunks.slice(0, Math.min(chunks.length, topK * 3));
  const items = candidates.map((c, idx) => ({
    id: idx + 1,
    chunkId: c.chunkId,
    page: c.pageNumber,
    title: c.documentTitle,
    text: c.chunkText.slice(0, 900),
  }));

  const systemPrompt = `You are a strict relevance judge. Score each chunk's relevance to the query on a 0-3 scale.
0 = not relevant, 1 = weakly relevant, 2 = relevant, 3 = highly relevant.
Return ONLY valid JSON: {"scores": [{"id": 1, "score": 2}, ...]}`;

  const userPrompt = `Query: ${query}

Chunks:
${items.map((i) => `[${i.id}] (${i.title} p.${i.page}) ${i.text}`).join('\n\n')}`;

  try {
    const response = await chatCompletion(systemPrompt, userPrompt, { maxTokens: 500 });
    const parsed = JSON.parse(response);
    const scores: Array<{ id: number; score: number }> = parsed?.scores || [];
    const scoreMap = new Map<number, number>();
    for (const s of scores) scoreMap.set(s.id, s.score);

    const ranked = candidates
      .map((c, idx) => ({ c, score: scoreMap.get(idx + 1) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.score > 0)
      .map((x) => x.c);

    return ranked.slice(0, topK);
  } catch (err: any) {
    logger.warn(`LLM rerank failed, falling back: ${err?.message || err}`);
    return chunks.slice(0, topK);
  }
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const result: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}
