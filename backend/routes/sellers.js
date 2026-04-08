import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/sellers — list all sellers
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM sellers ORDER BY name ASC');
  res.json(rows);
});

export default router;
