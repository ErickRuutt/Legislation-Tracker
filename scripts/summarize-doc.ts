import { runMigrations } from '../src/db/migrate';
import { closeDb } from '../src/db/connection';
import { generateDocumentSummary } from '../src/research/generate';

async function main() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    flags[key] = args[i + 1];
  }

  if (!flags.documentId) {
    console.error('Usage: npm run summarize:doc -- --documentId <uuid>');
    process.exit(1);
  }

  runMigrations();

  console.log('Generating document summary...\n');
  const result = await generateDocumentSummary(flags.documentId);

  console.log('='.repeat(60));
  console.log(result.markdown);
  console.log('='.repeat(60));
  console.log(`\nOutput ID: ${result.outputId}`);
  console.log(`Citations used: ${result.citations.length}`);

  closeDb();
}

main().catch((err) => {
  console.error('Error:', err.message);
  closeDb();
  process.exit(1);
});
