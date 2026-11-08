import type { RequestHandler } from 'express';

export interface RateLimitOptions {
  /** Requests allowed per visitor in one window. */
  max: number;
  windowMs: number;
  /** Friendly text sent with the 429 response. */
  message: string;
  /** Visitors tracked at once. The oldest is dropped first when this fills up. */
  maxVisitors?: number;
  now?: () => number;
}

/**
 * Fixed-window limit per client IP, kept in this server's memory. On Vercel each
 * running instance keeps its own count, so a burst spread across instances can get
 * a little past the limit. It still stops one bot from flooding a single instance,
 * and needs no paid service. `req.ip` is only the real client address when the app's
 * `trust proxy` setting matches the hosting (see TRUST_PROXY_HOPS).
 */
export function createRateLimiter({
  max,
  windowMs,
  message,
  maxVisitors = 10_000,
  now = Date.now,
}: RateLimitOptions): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return (req, res, next) => {
    const time = now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let window = windows.get(key);
    if (!window || time - window.start >= windowMs) {
      windows.delete(key);
      if (windows.size >= maxVisitors) {
        for (const [oldKey, old] of windows) {
          if (time - old.start >= windowMs || windows.size >= maxVisitors) windows.delete(oldKey);
          else break;
        }
      }
      window = { start: time, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((window.start + windowMs - time) / 1000));
      res
        .set('Retry-After', String(retryAfter))
        .set('Cache-Control', 'no-store')
        .status(429)
        .json({ success: false, error: message });
      return;
    }
    window.count++;
    next();
  };
}
