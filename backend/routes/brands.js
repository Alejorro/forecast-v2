import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/brands — list all brands
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM brands ORDER BY name ASC');
  res.json(rows);
});

export default router;
