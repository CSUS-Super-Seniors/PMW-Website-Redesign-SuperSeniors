import express, { type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {
  contactMessageSchema,
  mapContactMessageErrors,
  estimateStep1Schema,
  mapEstimateStep1Errors,
  serviceAreaCheckSchema,
  ESTIMATE_HONEYPOT_FIELD,
  ESTIMATE_RATE_LIMIT_MESSAGE,
  SERVICE_AREA_RATE_LIMIT_MESSAGE,
} from '@pmw/validation';
import type { ContactBackend, SavedContactMessage } from './contact.js';
import type { Config } from './config.js';
import type { AuthBackend } from './supabase.js';
import { requireOwner, requireStaff } from './auth.js';
import {
  SERVICE_AREA_UNAVAILABLE_MESSAGE,
  requireServiceArea,
  type ServiceAreaBackend,
  type ServiceAreaLocals,
} from './serviceArea.js';
import { PhotoRequestError, type EstimatePhotosBackend } from './estimatePhotos.js';
import { rejectHoneypot } from './lib/honeypot.js';
import { createRateLimiter } from './lib/rateLimit.js';

/** Where the estimate request form submits (SSPMW-70 adds the handler). */
export const ESTIMATE_SUBMIT_PATH = '/api/estimates';

/** Optional backends. Each route answers 503 or 501 when its backend is missing. */
export interface AppOptions {
  serviceArea?: ServiceAreaBackend;
  photos?: EstimatePhotosBackend;
  /** The SSPMW-70 handler that saves the inquiry. It only sees requests that pass. */
  estimateSubmit?: EstimateSubmitHandler;
}

/**
 * The submit handler runs after the rate limit, honeypot and service-area check, so
 * `res.locals.inServiceArea` is always `true` there. It still validates the rest of
 * the body with the shared schema.
 */
export type EstimateSubmitHandler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  Request['query'],
  ServiceAreaLocals
>;

export function createApp(
  config: Config,
  backend: AuthBackend,
  contact?: ContactBackend,
  { serviceArea, estimateSubmit, photos }: AppOptions = {},
) {
  const app = express();
  app.disable('x-powered-by');
  // Rate limits key on req.ip, which is only the visitor's address when this matches
  // the hosting. Never trust more proxies than really sit in front of the app.
  app.set('trust proxy', config.trustProxyHops);
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
  // Share SSPMW-95's bounded, proxy-aware limiter with the photo endpoints.
  app.use(
    '/api/estimates/photos',
    createRateLimiter({
      max: 60,
      windowMs: 60_000,
      maxVisitors: 10_000,
      message: 'Too many photo requests. Please wait a minute and retry.',
    }),
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (!photos) {
        res.status(503).json({ error: 'Photo uploads are temporarily unavailable.' });
        return;
      }
      next();
    },
  );
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
  // Estimate submit route. In order: the rate limit counts every attempt (SSPMW-95),
  // a filled honeypot is dropped (SSPMW-95), an outside-area city is refused
  // (SSPMW-24), and only then does the SSPMW-70 handler run.
  app.post(
    ESTIMATE_SUBMIT_PATH,
    createRateLimiter({ ...config.estimateRateLimit, message: ESTIMATE_RATE_LIMIT_MESSAGE }),
    // The submit handler reuses this parsed body (it includes photo receipts).
    express.json({ limit: '100kb', strict: false }),
    rejectHoneypot(ESTIMATE_HONEYPOT_FIELD),
    ...(estimateSubmit
      ? [requireServiceArea(serviceArea), estimateSubmit]
      : [
          ((_req, res) => {
            res.status(501).json({ error: 'Not implemented' });
          }) satisfies RequestHandler,
        ]),
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
  // Step 1 asks this before the customer can continue. It only answers yes or no,
  // so the city list itself is never sent to the browser.
  app.post(
    '/api/estimates/service-area',
    // Generous for a customer who corrects their city, but each check reads the database.
    createRateLimiter({
      max: 30,
      windowMs: 10 * 60_000,
      message: SERVICE_AREA_RATE_LIMIT_MESSAGE,
    }),
    express.json({ limit: '1kb', strict: false }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const parsed = serviceAreaCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'City is required.' });
        return;
      }
      if (!serviceArea) {
        res.status(503).json({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
        return;
      }
      try {
        res.json({ inServiceArea: await serviceArea.isInServiceArea(parsed.data.city) });
      } catch {
        res.status(503).json({ error: SERVICE_AREA_UNAVAILABLE_MESSAGE });
      }
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
