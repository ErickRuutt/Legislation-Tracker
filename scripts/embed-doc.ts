import { runMigrations } from '../src/db/migrate';
import { closeDb } from '../src/db/connection';
import { embedDocument } from '../src/research/embed';

async function main() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    flags[key] = args[i + 1];
  }

  if (!flags.documentId) {
    console.error('Usage: npm run embed:doc -- --documentId <uuid>');
    process.exit(1);
  }

  runMigrations();

  const result = await embedDocument(flags.documentId);

  console.log(`\nEmbedding complete!`);
  console.log(`  Document: ${result.documentId}`);
  console.log(`  Total chunks: ${result.totalChunks}`);
  console.log(`  New embeddings: ${result.newEmbeddings}`);
  console.log(`  Skipped (already embedded): ${result.skipped}`);
  console.log(`\nNext step: npm run summarize:doc -- --documentId ${result.documentId}`);

  closeDb();
}

main().catch((err) => {
  console.error('Error:', err.message);
  closeDb();
  process.exit(1);
});
