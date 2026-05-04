import { runMigrations } from './db/migrate';
import { startServer } from './api/server';
import { startScheduler } from './scheduler';
import { closeDb } from './db/connection';
import { logger } from './shared/logger';

function main(): void {
  logger.info('PFAS Monitor starting...');

  // Run database migrations
  runMigrations();

  // Start API server
  startServer();

  // Start scheduled collectors
  startScheduler();

  logger.info('PFAS Monitor is running');
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('uncaughtException', (err: any) => {
  logger.error(`Uncaught exception: ${err?.message || err}`);
});

process.on('unhandledRejection', (err: any) => {
  logger.error(`Unhandled rejection: ${err?.message || err}`);
});

main();
