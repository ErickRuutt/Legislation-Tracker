import OpenAI from 'openai';
import { config } from './config';
import { logger } from './logger';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const CHAT_MODEL = 'gpt-4o-mini';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set in .env');
    }
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // OpenAI supports up to 2048 inputs per batch call
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    logger.info(`Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} items)`);

    const response = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    // Response data is ordered by index
    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d) => d.embedding));

    // Rate limit: small pause between batches
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allEmbeddings;
}

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: options?.maxTokens ?? 2000,
    temperature: options?.temperature ?? 0.3,
  });

  return response.choices[0]?.message?.content || '';
}

export { EMBEDDING_MODEL, EMBEDDING_DIMS, CHAT_MODEL };
