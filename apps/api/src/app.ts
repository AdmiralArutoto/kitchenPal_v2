import express from 'express';
import pinoHttp from 'pino-http';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();

  app.use(pinoHttp());
  app.use(express.json());

  // Public liveness check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Authed placeholder — every Stage-3 route follows this shape
  app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ userId: req.userId });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
