import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/brands — list all brands
router.get('/', (req, res) => {
  const brands = db.prepare('SELECT id, name FROM brands ORDER BY name ASC').all();
  res.json(brands);
});

export default router;
