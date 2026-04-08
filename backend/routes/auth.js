import { Router } from 'express';
import { findUser } from '../auth/users.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = findUser(String(username).trim(), String(password));
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = user;

  res.json({
    role:       user.role,
    sellerCode: user.sellerCode ?? null,
    sellerName: user.sellerName ?? null,
  });
});

// POST /api/auth/guest — enter as read-only guest
router.post('/guest', (req, res) => {
  req.session.user = { role: 'guest' };
  res.json({ role: 'guest' });
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
    sellerCode: user.sellerCode ?? null,
    sellerName: user.sellerName ?? null,
  });
});

export default router;
