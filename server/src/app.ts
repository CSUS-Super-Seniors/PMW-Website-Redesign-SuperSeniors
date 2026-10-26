import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { AuthBackend } from './supabase.js';
import { requireOwner, requireStaff } from './auth.js';
export function createApp(config: Config, backend: AuthBackend) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !config.clientOrigins.includes(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    next();
  });
  app.use(
    cors({
      origin: config.clientOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use(requireStaff(backend));
  api.get('/me', (req, res) => {
    res.set('Cache-Control', 'no-store').json(req.staff);
  });
  api.use(requireOwner);
  api.get('/owner/check', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  app.use('/api', api);
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    void _next;
    const status =
      err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({
      error:
        status === 400
          ? 'Invalid JSON'
          : status === 413
            ? 'Request too large'
            : 'Internal server error',
    });
  };
  app.use(handleError);
  return app;
}
