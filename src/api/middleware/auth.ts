import { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.API_KEY;

  // If no API_KEY is configured, allow all (local dev convenience)
  if (!apiKey) {
    next();
    return;
  }

  const provided = req.headers['x-api-key'] || req.query.apiKey;

  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

// Apply to all mutating methods on a router
export function protectWrites(req: Request, res: Response, next: NextFunction): void {
  const readMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (readMethods.includes(req.method)) {
    next();
    return;
  }
  requireApiKey(req, res, next);
}
