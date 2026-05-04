import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../shared/logger';
import { getIngestJob, incrementRetry, updateIngestJob } from './ingest-jobs';

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const WORKER_PATH = path.join(PROJECT_ROOT, 'src/research/ingest-worker.ts');
const WORKER_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_RETRIES = 2;

export function spawnIngestWorker(params: {
  jobId: string;
  filePath: string;
  title: string;
  sourceUrl?: string;
}): void {
  const args = [
    '--max-old-space-size=8192',
    '--import',
    'tsx',
    WORKER_PATH,
    params.jobId,
    params.filePath,
    params.title,
  ];

  if (params.sourceUrl) {
    args.push(params.sourceUrl);
  }

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    detached: false,
  });

  logger.info(`Ingest worker spawned for job ${params.jobId}`);

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    updateIngestJob(params.jobId, {
      status: 'error',
      errorMessage: `Worker timed out after ${Math.round(WORKER_TIMEOUT_MS / 60000)} minutes`,
    });
    try {
      child.kill('SIGKILL');
    } catch {}
  }, WORKER_TIMEOUT_MS);

  child.on('exit', (code) => {
    clearTimeout(timeout);
    logger.info(`Ingest worker exited for job ${params.jobId} with code ${code}`);
    if (code === 0) return;

    if (timedOut) {
      scheduleRetry(params.jobId, 'timeout');
      return;
    }

    scheduleRetry(params.jobId, `exit code ${code}`);
  });
}

function scheduleRetry(jobId: string, reason: string): void {
  const job = getIngestJob(jobId);
  if (!job) return;
  if (job.retry_count >= MAX_RETRIES) {
    updateIngestJob(jobId, {
      status: 'error',
      errorMessage: `Worker failed after ${job.retry_count} retries (${reason})`,
    });
    return;
  }

  incrementRetry(jobId);
  updateIngestJob(jobId, { status: 'queued' });
  logger.warn(`Retrying ingest job ${jobId} (${reason})`);
  spawnIngestWorker({
    jobId,
    filePath: job.file_path,
    title: job.title,
    sourceUrl: job.source_url || undefined,
  });
}
