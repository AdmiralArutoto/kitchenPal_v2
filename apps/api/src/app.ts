import express from 'express';
import pinoHttp from 'pino-http';
import { profileRouter } from './routes/profile.js';
import { recipesRouter } from './routes/recipes.js';
import { aiRouter } from './routes/ai.js';
import { recommendationsRouter } from './routes/recommendations.js';
import { importRouter } from './routes/import.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();

  app.use(pinoHttp());
  app.use(express.json());

  // Public liveness check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/profile', profileRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/recommendations', recommendationsRouter);
  app.use('/api/import', importRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
