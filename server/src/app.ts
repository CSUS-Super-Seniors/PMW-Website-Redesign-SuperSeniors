import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

export function createApp(clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173') {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
