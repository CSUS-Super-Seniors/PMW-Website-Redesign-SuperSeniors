import { isIPv4, isIPv6 } from 'node:net';
import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  /** Requests allowed per visitor in one window. */
  max: number;
  windowMs: number;
  /** Friendly text sent with the 429 response. */
  message: string;
  /**
   * Visitors tracked one by one. When every slot is still active, new visitors share
   * one overflow window, so a flood of addresses can't reset limits or lock people out.
   */
  maxVisitors?: number;
  /** Requests the shared overflow window allows (default 50 times `max`). */
  overflowMax?: number;
  now?: () => number;
}

/** Full 8-group form of an IPv6 address, or undefined when it isn't one. */
function expandIPv6(ip: string): string[] | undefined {
  if (!isIPv6(ip)) return undefined;
  let address = ip.split('%')[0]!.toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];
  if (v4) {
    const [a, b, c, d] = v4.split('.').map(Number) as [number, number, number, number];
    address =
      address.slice(0, -v4.length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((group) => group.padStart(4, '0'));
}

/**
 * The visitor a request counts against. IPv4 addresses count one by one. IPv6
 * addresses count by their /64 network, since one home or server usually gets a
 * whole /64 and could otherwise rotate through addresses to dodge the limit.
 */
export function rateLimitKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (isIPv4(ip)) return ip;
  const groups = expandIPv6(ip);
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : ip;
}

/**
 * Fixed-window limit per visitor, kept in this server's memory. On Vercel each
 * running instance keeps its own count, so a burst spread across instances can get
 * a little past the limit. It still stops one bot from flooding a single instance,
 * and needs no paid service. `req.ip` is only the real client address when the app's
 * `trust proxy` setting matches the hosting (see TRUST_PROXY_HOPS).
 */
export function createRateLimiter({
  max,
  windowMs,
  message,
  maxVisitors = 50_000,
  overflowMax = max * 50,
  now = Date.now,
}: RateLimitOptions): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  let overflow = { start: 0, count: 0 };

  function refuse(res: Parameters<RequestHandler>[1], retryAfterMs: number) {
    res
      .set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
      .set('Cache-Control', 'no-store')
      .status(429)
      .json({ success: false, error: message });
  }

  return (req: Request, res, next) => {
    const time = now();
    const key = rateLimitKey(req.ip ?? req.socket.remoteAddress);
    let window = windows.get(key);
    if (window && time - window.start >= windowMs) {
      windows.delete(key);
      window = undefined;
    }
    if (!window) {
      if (windows.size >= maxVisitors) {
        // Windows start in insertion order, so expired ones are at the front.
        for (const [oldKey, old] of windows) {
          if (time - old.start < windowMs) break;
          windows.delete(oldKey);
        }
      }
      if (windows.size >= maxVisitors) {
        // Every tracked visitor is still inside their window. Dropping one would reset
        // a live limit, and refusing everyone new would lock real customers out during
        // a flood. Instead, untracked visitors share one larger overflow window.
        if (time - overflow.start >= windowMs) overflow = { start: time, count: 0 };
        if (overflow.count >= overflowMax) {
          refuse(res, overflow.start + windowMs - time);
          return;
        }
        overflow.count++;
        next();
        return;
      }
      window = { start: time, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= max) {
      refuse(res, window.start + windowMs - time);
      return;
    }
    window.count++;
    next();
  };
}
