/**
 * Auth middleware for DOT4 Forecast V2.
 * Roles: admin | manager | seller
 */

// Attach session user to req.user on every request.
export function attachUser(req, _res, next) {
  req.user = req.session?.user ?? null;
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
