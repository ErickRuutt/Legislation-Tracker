// Worker process for PDF ingestion
// Usage: node --import tsx ingest-worker.ts <jobId> <filePath> <title> [sourceUrl]

import fs from 'fs';
import { ingestPdf } from './ingest';
import { embedDocument } from './embed';
import { updateIngestJob } from './ingest-jobs';
import { logger } from '../shared/logger';

const jobId = process.argv[2];
const filePath = process.argv[3];
const title = process.argv[4];
const sourceUrl = process.argv[5];

if (!jobId || !filePath || !title) {
  console.error('Usage: ingest-worker.ts <jobId> <filePath> <title> [sourceUrl]');
  process.exitCode = 1;
} else {
  (async () => {
    try {
      logger.info(`Ingest worker started for job ${jobId}`);
      updateIngestJob(jobId, { status: 'running' });
      const ingestResult = await ingestPdf({
        filePath,
        title,
        sourceUrl: sourceUrl || undefined,
      });

      if (!ingestResult.alreadyExists) {
        await embedDocument(ingestResult.documentId);
      }

      updateIngestJob(jobId, {
        status: 'success',
        documentId: ingestResult.documentId,
        errorMessage: null,
      });

      logger.info(`Ingest worker completed for job ${jobId}`);
      // Clean up uploaded temp file on success
      fs.unlink(filePath, () => {});
    } catch (err: any) {
      updateIngestJob(jobId, {
        status: 'error',
        errorMessage: err?.message || 'Unknown error',
      });
      logger.error(`Ingest worker failed: ${err?.message || err}`);
      process.exitCode = 1;
    }
  })();
}
