import { Router } from 'express';
import { findUser } from '../auth/users.js';
import pool from '../db.js';

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

  req.session.user = { role: user.role, sellerName: user.sellerName, sellerId };

  res.json({
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

// GET /api/auth/me — returns current session user
router.get('/me', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  res.json({
    role:       user.role,
    sellerName: user.sellerName ?? null,
    sellerId:   user.sellerId  ?? null,
  });
});

export default router;
