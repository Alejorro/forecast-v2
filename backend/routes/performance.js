import { Router } from 'express';
import pool from '../db.js';
import { deriveTransaction } from '../lib/forecast.js';

const router = Router();

// GET /api/performance?year=YYYY&seller_id=N
// Sellers always see their own data. Admins can specify seller_id.
router.get('/', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

  let sellerId;
  if (user.role === 'seller') {
    sellerId = user.sellerId;
  } else if (user.role === 'admin' || user.role === 'manager') {
    sellerId = req.query.seller_id ? Number(req.query.seller_id) : null;
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!sellerId) {
    return res.json({
      summary: { total: 0, total_tcv: 0, won_count: 0, won_tcv: 0, open_count: 0, open_tcv: 0, loss_count: 0, loss_tcv: 0, win_rate: 0 },
      by_stage: [],
      by_brand: [],
      top_open: [],
    });
  }

  // All transactions for this seller+year (including LOSS)
  const { rows: allRows } = await pool.query(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.deleted_at IS NULL
      AND t.seller_id = $1
      AND t.year = $2
  `, [sellerId, year]);

  const derived = allRows.map(deriveTransaction);

  const wonRows  = derived.filter(t => t.stage_label === 'Won');
  const lossRows = derived.filter(t => t.stage_label === 'LOSS');
  const openRows = derived.filter(t => t.stage_label !== 'Won' && t.stage_label !== 'LOSS');

  const sum = (arr, field) => arr.reduce((s, t) => s + (t[field] ?? 0), 0);

  const wonCount  = wonRows.length;
  const closedCount = wonRows.length + lossRows.length;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

  const summary = {
    total:       derived.length,
    total_tcv:   sum(derived.filter(t => t.stage_label !== 'LOSS'), 'tcv'),
    won_count:   wonCount,
    won_tcv:     sum(wonRows, 'tcv'),
    open_count:  openRows.length,
    open_tcv:    sum(openRows, 'tcv'),
    loss_count:  lossRows.length,
    loss_tcv:    sum(lossRows, 'tcv'),
    win_rate:    winRate,
  };

  // By stage (excluding LOSS)
  const stageMap = {};
  derived.filter(t => t.stage_label !== 'LOSS').forEach(t => {
    const s = t.stage_label;
    if (!stageMap[s]) stageMap[s] = { stage_label: s, count: 0, tcv: 0 };
    stageMap[s].count++;
    stageMap[s].tcv += t.tcv ?? 0;
  });
  const by_stage = Object.values(stageMap);

  // By brand
  const brandMap = {};
  derived.filter(t => t.stage_label !== 'LOSS').forEach(t => {
    const b = t.brand_name;
    if (!brandMap[b]) brandMap[b] = { brand_name: b, quoted_tcv: 0, won_tcv: 0 };
    brandMap[b].quoted_tcv += t.tcv ?? 0;
    if (t.stage_label === 'Won') brandMap[b].won_tcv += t.tcv ?? 0;
  });
  const by_brand = Object.values(brandMap).sort((a, b) => b.quoted_tcv - a.quoted_tcv);

  // Top open transactions
  const top_open = openRows
    .sort((a, b) => (b.tcv ?? 0) - (a.tcv ?? 0))
    .slice(0, 10);

  res.json({ summary, by_stage, by_brand, top_open });
});

export default router;
