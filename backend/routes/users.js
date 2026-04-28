import { Router } from 'express';
import pool from '../db.js';
import { requireManager } from '../middleware/auth.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

const VALID_ROLES = ['admin', 'manager', 'seller'];

// GET /api/users — list all users (no passwords)
router.get('/', requireManager, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT username, role, seller_name FROM users ORDER BY role, username'
  );
  res.json(rows);
});

// POST /api/users — create user
router.post('/', requireManager, async (req, res) => {
  const { username, password, role, seller_name } = req.body;
  if (!username?.trim())       return res.status(400).json({ error: 'username es obligatorio' });
  if (!password?.trim())       return res.status(400).json({ error: 'password es obligatorio' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  const { rows } = await pool.query(
    `INSERT INTO users (username, password, role, seller_name)
     VALUES ($1, $2, $3, $4)
     RETURNING username, role, seller_name`,
    [username.trim(), password.trim(), role, seller_name?.trim() || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/users/:username — update role, password, seller_name
router.put('/:username', requireManager, async (req, res) => {
  const target = req.params.username;
  const { password, role, seller_name } = req.body;

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  const sets = [];
  const vals = [];
  if (role !== undefined)        { sets.push(`role = $${vals.length + 1}`);        vals.push(role); }
  if (seller_name !== undefined) { sets.push(`seller_name = $${vals.length + 1}`); vals.push(seller_name?.trim() || null); }
  if (password?.trim())          { sets.push(`password = $${vals.length + 1}`);    vals.push(password.trim()); }
  if (sets.length === 0)         return res.status(400).json({ error: 'Nada para actualizar' });

  vals.push(target);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE username = $${vals.length}
     RETURNING username, role, seller_name`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// DELETE /api/users/:username
router.delete('/:username', requireManager, async (req, res) => {
  const target = req.params.username;
  if (target.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' });
  }
  const { rowCount } = await pool.query('DELETE FROM users WHERE username = $1', [target]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
});

export default router;
