import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/sellers — list all sellers
router.get('/', (req, res) => {
  const sellers = db.prepare('SELECT id, name FROM sellers ORDER BY name ASC').all();
  res.json(sellers);
});

export default router;
