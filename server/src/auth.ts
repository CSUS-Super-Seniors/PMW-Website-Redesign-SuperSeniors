import type { RequestHandler } from 'express';
import type { AuthBackend } from './supabase.js';
declare global {
  namespace Express {
    interface Request { staff?: { userId: string; role: string; status: string } }
  }
}
export function requireStaff(backend: AuthBackend): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
    if (!match) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const user = await backend.verifyToken(match[1]);
      if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const profile = await backend.loadProfile(user.id);
      if (!profile || profile.status !== 'active' || !['owner', 'employee'].includes(profile.role)) {
        res.status(403).json({ error: 'Active staff access required' }); return;
      }
      req.staff = { userId: user.id, role: profile.role, status: profile.status };
      next();
    } catch { res.status(503).json({ error: 'Authentication service unavailable' }); }
  };
}
export const requireOwner: RequestHandler = (req, res, next) => {
  if (!req.staff) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (req.staff.role !== 'owner') { res.status(403).json({ error: 'Owner access required' }); return; }
  next();
};
