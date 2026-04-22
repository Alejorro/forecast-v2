import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/activity — accessible to admin and manager only
router.get('/', async (req, res) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { performed_by, action, limit = 200 } = req.query;
  const conditions = [];
  const bindings = [];

  if (performed_by) {
    conditions.push(`performed_by = $${bindings.length + 1}`);
    bindings.push(performed_by);
  }

  if (action) {
    conditions.push(`action = $${bindings.length + 1}`);
    bindings.push(action);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const safeLimit = Math.min(Number(limit) || 200, 500);

  const { rows } = await pool.query(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${bindings.length + 1}`,
    [...bindings, safeLimit]
  );

  res.json(rows);
});

export default router;
