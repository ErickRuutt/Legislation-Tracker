import { runMigrations } from '../src/db/migrate';
import { closeDb } from '../src/db/connection';
import { answerQuestionWithCitations } from '../src/research/generate';

async function main() {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    flags[key] = args[i + 1];
  }

  if (!flags.query) {
    console.error('Usage: npm run ask -- --query "What are the health effects of PFAS?" [--topK 8]');
    process.exit(1);
  }

  runMigrations();

  const topK = flags.topK ? parseInt(flags.topK, 10) : 8;

  console.log(`Searching corpus and generating answer...\n`);
  const result = await answerQuestionWithCitations(flags.query, { topK });

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
