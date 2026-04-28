import { Router } from 'express';
import pool from '../db.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

// GET /api/sellers — list all sellers
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM sellers ORDER BY name ASC');
  res.json(rows);
});

export default router;
