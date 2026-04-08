/**
 * Auth middleware for DOT4 Forecast V2.
 * Roles: admin | seller | guest
 */

// Attach session user to req.user on every request.
export function attachUser(req, _res, next) {
  req.user = req.session?.user ?? null;
  next();
}

// Require admin role.
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Require admin or seller (blocks guests and unauthenticated requests).
// Use this to guard write operations that sellers are also allowed to perform.
export function requireWrite(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'seller') {
    return res.status(403).json({ error: 'Write access not allowed' });
  }
  next();
}
