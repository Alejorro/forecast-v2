/**
 * Auth middleware for DOT4 Forecast V2.
 * Roles: admin | manager | seller
 */

import { getSessionVersion } from '../lib/session-version.js';

// Attach session user to req.user on every request.
// If the session was created before the current sessionVersion, treat it as expired.
export function attachUser(req, _res, next) {
  const u = req.session?.user;
  if (u && u.sessionVersion !== getSessionVersion()) {
    req.session.destroy(() => {});
    req.user = null;
  } else {
    req.user = u ?? null;
  }
  next();
}

// Require admin or manager role.
export function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Require admin, manager, or seller.
export function requireWrite(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'manager' && role !== 'seller') {
    return res.status(403).json({ error: 'Write access not allowed' });
  }
  next();
}
