import { Router } from 'express';
import { findUser } from '../auth/users.js';
import pool from '../db.js';
import { getSessionVersion, bumpSessionVersion } from '../lib/session-version.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = findUser(String(username).trim(), String(password));
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let sellerId = null;
  if (user.role === 'seller' && user.sellerName) {
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
