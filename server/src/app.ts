import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {
  contactMessageSchema,
  mapContactMessageErrors,
  estimateStep1Schema,
  mapEstimateStep1Errors,
} from '@pmw/validation';
import type { ContactBackend, SavedContactMessage } from './contact.js';
import type { Config } from './config.js';
import type { AuthBackend } from './supabase.js';
import { requireOwner, requireStaff } from './auth.js';
import { PhotoRequestError, type EstimatePhotosBackend } from './estimatePhotos.js';
export function createApp(
  config: Config,
  backend: AuthBackend,
  contact?: ContactBackend,
  photos?: EstimatePhotosBackend,
  checkServiceArea?: (details: import('@pmw/validation').EstimateStep1Data) => Promise<boolean>,
) {
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
  // Bounded, instance-local upload guard. Distributed perimeter limits remain SSPMW-95.
  const uploadWindows = new Map<string, { start: number; count: number }>();
  app.use('/api/estimates/photos', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();
    for (const [key, value] of uploadWindows)
      if (now - value.start >= 60000) uploadWindows.delete(key);
    const key = req.ip ?? 'unknown';
    const window = uploadWindows.get(key) ?? { start: now, count: 0 };
    if ((!uploadWindows.has(key) && uploadWindows.size >= 10000) || window.count >= 60) {
      res
        .set('Retry-After', '60')
        .status(429)
        .json({ error: 'Too many photo requests. Please wait a minute and retry.' });
      return;
    }
    window.count++;
    uploadWindows.set(key, window);
    if (!photos) {
      res.status(503).json({ error: 'Photo uploads are temporarily unavailable.' });
      return;
    }
    next();
  });
  app.post('/api/estimates/photos/session', (_req, res) => {
    res.status(201).json(photos!.startSession());
  });
  app.post('/api/estimates/photos/session/renew', (req, res) => {
    const token = /^Photo ([^\s]+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    try {
      res.json(photos!.renewSession(token));
    } catch (error) {
      res.status(error instanceof PhotoRequestError ? error.status : 503).json({
        error:
          error instanceof PhotoRequestError
            ? error.message
            : 'Could not renew photo session. Please retry.',
      });
    }
  });
  app.put(
    '/api/estimates/photos/:photoId',
    express.raw({ type: () => true, limit: '1mb' }),
    async (req, res) => {
      const token = /^Photo ([^\s]+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
      try {
        const result = await photos!.upload(
          token,
          String(req.params.photoId),
          req.body,
          req.get('content-type') ?? '',
        );
        res.status(201).json(result);
      } catch (error) {
        res.status(error instanceof PhotoRequestError ? error.status : 503).json({
          error:
            error instanceof PhotoRequestError
              ? error.message
              : 'Photo upload failed. Please retry or remove the photo.',
        });
      }
    },
  );
  app.post(
    '/api/estimates/service-area',
    express.json({ limit: '32kb', strict: false }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const parsed = estimateStep1Schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please check your details.' });
        return;
      }
      if (!checkServiceArea) {
        res.status(503).json({ error: 'Service-area checking is temporarily unavailable.' });
        return;
      }
      try {
        res.json({ inServiceArea: await checkServiceArea(parsed.data) });
      } catch {
        res.status(503).json({ error: 'Service-area checking is temporarily unavailable.' });
      }
    },
  );
  // Let the shared schema report valid JSON primitives as form-level errors.
  // Other routes retain the existing strict JSON parser.
  app.post(
    '/api/estimates/validate-step-1',
    express.json({ limit: '1mb', strict: false }),
    (req, res) => {
      const result = estimateStep1Schema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ valid: false, ...mapEstimateStep1Errors(result.error) });
        return;
      }
      res.json({ valid: true });
    },
  );
  app.post(
    '/api/contact-messages',
    express.json({ limit: '32kb', strict: false }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const result = contactMessageSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: 'Please check the contact form.',
          ...mapContactMessageErrors(result.error),
        });
        return;
      }
      if (!contact) {
        res
          .status(503)
          .json({ success: false, error: 'Contact messaging is temporarily unavailable.' });
        return;
      }
      let saved: SavedContactMessage;
      try {
        saved = await contact.saveMessage(result.data);
      } catch {
        res.status(503).json({
          success: false,
          error: 'Your message could not be saved. Please try again.',
        });
        return;
      }
      try {
        await contact.sendNotification(saved);
      } catch {
        // The message was received. Asking the visitor to retry would save it
        // again. Keep notification failures in server logs, without logging
        // visitor content, credentials, or raw provider errors.
        console.error('Contact notification failed', { contactMessageId: saved.id });
      }
      res.status(201).json({ success: true });
    },
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
  api.get('/schedule', (_req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });
  api.get('/jobs/:jobId', (_req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });
  api.post('/jobs/:jobId/media', (_req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });
  api.use(requireOwner);
  api.get('/inquiry-photos/:photoId/view-url', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!photos) {
      res.status(503).json({ error: 'Photo viewing is temporarily unavailable.' });
      return;
    }
    try {
      res.json(await photos.viewPhoto(String(req.params.photoId)));
    } catch (error) {
      res.status(error instanceof PhotoRequestError ? error.status : 503).json({
        error: error instanceof PhotoRequestError ? error.message : 'Could not load photo.',
      });
    }
  });
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
