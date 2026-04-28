import { Router } from 'express';
import { findUser } from '../auth/users.js';
import pool from '../db.js';
import { getSessionVersion, bumpSessionVersion } from '../lib/session-version.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function checkLoginRateLimit(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const current = loginAttempts.get(key);
  const record = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + LOGIN_WINDOW_MS };

  record.count += 1;
  loginAttempts.set(key, record);
  req.loginRateLimitKey = key;

  if (record.count > LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  next();
}

// POST /api/auth/login
router.post('/login', checkLoginRateLimit, async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = findUser(String(username).trim(), String(password));
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  loginAttempts.delete(req.loginRateLimitKey);

  let sellerId = null;
  if (user.sellerName) {
    const { rows } = await pool.query(
      'SELECT id FROM sellers WHERE name_normalized = $1',
      [user.sellerName.toLowerCase().trim()]
    );
    sellerId = rows[0]?.id ?? null;
  }

  req.session.user = { username: user.username, role: user.role, sellerName: user.sellerName, sellerId, sessionVersion: getSessionVersion() };

  res.json({
    username:   user.username,
    role:       user.role,
    sellerName: user.sellerName ?? null,
    sellerId:   sellerId,
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dot4.sid');
    res.json({ ok: true });
  });
});

// POST /api/auth/invalidate-all — bump session version, forces all users to re-login
router.post('/invalidate-all', (req, res) => {
  const role = req.session?.user?.role;
  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Access denied' });
  }
  bumpSessionVersion();
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// GET /api/auth/me — returns current session user
router.get('/me', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  res.json({
    username:   user.username  ?? null,
    role:       user.role,
    sellerName: user.sellerName ?? null,
    sellerId:   user.sellerId  ?? null,
  });
});

export default router;
