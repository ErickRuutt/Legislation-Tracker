import { runMigrations } from '../src/db/migrate';
import { closeDb } from '../src/db/connection';
import { ingestPdf } from '../src/research/ingest';

async function main() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    flags[key] = args[i + 1];
  }

  if (!flags.path) {
    console.error('Usage: npm run ingest:pdf -- --path "/path/to/file.pdf" --title "Document Title" [--sourceUrl "https://..."]');
    process.exit(1);
  }

  if (!flags.title) {
    // Derive title from filename
    flags.title = flags.path.split('/').pop()?.replace('.pdf', '') || 'Untitled';
  }

  runMigrations();

  const result = await ingestPdf({
    filePath: flags.path,
    title: flags.title,
    sourceUrl: flags.sourceUrl,
  });

  if (result.alreadyExists) {
    console.log(`\nDocument already ingested.`);
  } else {
    console.log(`\nIngestion complete!`);
  }
  console.log(`  Document ID: ${result.documentId}`);
  console.log(`  Title: ${result.title}`);
  console.log(`  Pages: ${result.pageCount}`);
  console.log(`  Chunks: ${result.chunkCount}`);
  console.log(`\nNext step: npm run embed:doc -- --documentId ${result.documentId}`);

  closeDb();
}

main().catch((err) => {
  console.error('Error:', err.message);
  closeDb();
  process.exit(1);
});
