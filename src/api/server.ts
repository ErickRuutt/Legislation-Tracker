import express from 'express';
import cors from 'cors';
import { config } from '../shared/config';
import { logger } from '../shared/logger';
import { protectWrites } from './middleware/auth';
import overviewRoutes from './routes/overview';
import legislationRoutes from './routes/legislation';
import contractsRoutes from './routes/contracts';
import articlesRoutes from './routes/articles';
import socialRoutes from './routes/social';
import alertsRoutes from './routes/alerts';
import collectorsRoutes from './routes/collectors';
import researchRoutes from './routes/research';
import topicsRoutes from './routes/topics';

export function createServer(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // All mutating requests (POST/PUT/PATCH/DELETE) require API key
  app.use(protectWrites);

  // Routes
  app.use('/api/overview', overviewRoutes);
  app.use('/api/legislation', legislationRoutes);
  app.use('/api/contracts', contractsRoutes);
  app.use('/api/articles', articlesRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/collectors', collectorsRoutes);
  app.use('/api/research', researchRoutes);
  app.use('/api/topics', topicsRoutes);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handler to surface middleware failures (e.g., uploads)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`Unhandled server error: ${err?.message || err}`);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  });

  return app;
}

export function startServer(): void {
  const app = createServer();
  const server = app.listen(config.port, () => {
    logger.info(`API server running on port ${config.port}`);
  });
  // Allow long uploads without timing out the socket
  server.setTimeout(0);
  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      logger.error(`Port ${config.port} is already in use. Exiting.`);
      process.exit(1);
    }
    logger.error(`Server error: ${err?.message || err}`);
    process.exit(1);
  });
}
