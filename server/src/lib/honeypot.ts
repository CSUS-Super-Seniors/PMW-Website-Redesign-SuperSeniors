import type { RequestHandler } from 'express';

/**
 * Mount after the JSON body is parsed. A filled honeypot gets the same 201 a real
 * submission gets, so the bot learns nothing, but the request stops here: nothing
 * is saved and no email is sent. An empty honeypot is removed from the body so
 * strict schemas never see it.
 */
export function rejectHoneypot(field: string): RequestHandler {
  return (req, res, next) => {
    const body: unknown = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, field)) {
      const record = body as Record<string, unknown>;
      const value = record[field];
      if (!(typeof value === 'string' && value.trim() === '')) {
        // No visitor content in logs: the count of trapped requests is enough.
        console.warn('Estimate request dropped by honeypot');
        res.set('Cache-Control', 'no-store').status(201).json({ success: true });
        return;
      }
      delete record[field];
    }
    next();
  };
}
