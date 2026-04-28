import { Router } from 'express';
import pool from '../db.js';
import { STAGE_MAP, computeGap } from '../lib/forecast.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function forecastForBrandYear(brand_id, year) {
  const { rows } = await pool.query(`
    SELECT tcv, stage_label,
           allocation_q1, allocation_q2, allocation_q3, allocation_q4
    FROM transactions
    WHERE brand_id = $1
      AND year = $2
      AND deleted_at IS NULL
      AND stage_label != 'LOSS'
  `, [brand_id, year]);

  const result = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const r of rows) {
    const pct = STAGE_MAP[r.stage_label] ?? 0;
    const wt  = r.tcv * pct;
    result.q1 += wt * r.allocation_q1;
    result.q2 += wt * r.allocation_q2;
    result.q3 += wt * r.allocation_q3;
    result.q4 += wt * r.allocation_q4;
  }
  result.fy = result.q1 + result.q2 + result.q3 + result.q4;
  return result;
}

function fyPlan(plan) {
  if (!plan) return null;
  const { q1_plan, q2_plan, q3_plan, q4_plan } = plan;
  if (q1_plan === null || q2_plan === null || q3_plan === null || q4_plan === null) return null;
  return q1_plan + q2_plan + q3_plan + q4_plan;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/plans?year=YYYY
router.get('/', async (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();

  const { rows: brands }   = await pool.query('SELECT id, name FROM brands ORDER BY name ASC');
  const { rows: planRows } = await pool.query('SELECT * FROM plans WHERE year = $1', [year]);
  const planByBrand = Object.fromEntries(planRows.map(p => [p.brand_id, p]));

  const result = await Promise.all(brands.map(async brand => {
    const plan = planByBrand[brand.id] || null;
    const fc   = await forecastForBrandYear(brand.id, year);
    const fy   = fyPlan(plan);

    return {
      brand_id:    brand.id,
      brand_name:  brand.name,
      year,
      q1_plan:     plan?.q1_plan ?? null,
      q2_plan:     plan?.q2_plan ?? null,
      q3_plan:     plan?.q3_plan ?? null,
      q4_plan:     plan?.q4_plan ?? null,
      fy_plan:     fy,
      fy_forecast: fc.fy,
      fy_gap:      computeGap(fy, fc.fy),
    };
  }));

  res.json(result);
});

// GET /api/plans/:brand_id?year=YYYY
router.get('/:brand_id', async (req, res) => {
  const brand_id = Number(req.params.brand_id);
  const year     = Number(req.query.year) || new Date().getUTCFullYear();

  const { rows: brandRows } = await pool.query('SELECT id, name FROM brands WHERE id = $1', [brand_id]);
  const brand = brandRows[0];
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const { rows: planRows } = await pool.query('SELECT * FROM plans WHERE brand_id = $1 AND year = $2', [brand_id, year]);
  const plan = planRows[0] ?? null;
  const fc   = await forecastForBrandYear(brand_id, year);
  const fy   = fyPlan(plan);

  res.json({
    brand_id:    brand.id,
    brand_name:  brand.name,
    year,
    q1_plan:     plan?.q1_plan ?? null,
    q2_plan:     plan?.q2_plan ?? null,
    q3_plan:     plan?.q3_plan ?? null,
    q4_plan:     plan?.q4_plan ?? null,
    fy_plan:     fy,
    quarterly_breakdown: [
      { quarter: 1, plan: plan?.q1_plan ?? null, forecast: fc.q1, gap: computeGap(plan?.q1_plan ?? null, fc.q1) },
      { quarter: 2, plan: plan?.q2_plan ?? null, forecast: fc.q2, gap: computeGap(plan?.q2_plan ?? null, fc.q2) },
      { quarter: 3, plan: plan?.q3_plan ?? null, forecast: fc.q3, gap: computeGap(plan?.q3_plan ?? null, fc.q3) },
      { quarter: 4, plan: plan?.q4_plan ?? null, forecast: fc.q4, gap: computeGap(plan?.q4_plan ?? null, fc.q4) },
    ],
    fy_forecast: fc.fy,
    fy_gap:      computeGap(fy, fc.fy),
  });
});

// PUT /api/plans/:brand_id — upsert
router.put('/:brand_id', async (req, res) => {
  const brand_id = Number(req.params.brand_id);
  const body     = req.body;

  const { rows: brandRows } = await pool.query('SELECT id FROM brands WHERE id = $1', [brand_id]);
  if (!brandRows[0]) return res.status(404).json({ error: 'Brand not found' });

  if (!body.year) return res.status(400).json({ error: 'year is required' });

  const year    = Number(body.year);
  const q1_plan = body.q1_plan !== undefined ? (body.q1_plan === null ? null : Number(body.q1_plan)) : null;
  const q2_plan = body.q2_plan !== undefined ? (body.q2_plan === null ? null : Number(body.q2_plan)) : null;
  const q3_plan = body.q3_plan !== undefined ? (body.q3_plan === null ? null : Number(body.q3_plan)) : null;
  const q4_plan = body.q4_plan !== undefined ? (body.q4_plan === null ? null : Number(body.q4_plan)) : null;

  await pool.query(`
    INSERT INTO plans (year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (year, brand_id) DO UPDATE SET
      q1_plan = EXCLUDED.q1_plan,
      q2_plan = EXCLUDED.q2_plan,
      q3_plan = EXCLUDED.q3_plan,
      q4_plan = EXCLUDED.q4_plan
  `, [year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan]);

  const { rows: updatedRows } = await pool.query('SELECT * FROM plans WHERE brand_id = $1 AND year = $2', [brand_id, year]);
  const updated = updatedRows[0];
  const fy      = fyPlan(updated);
  const fc      = await forecastForBrandYear(brand_id, year);

  res.json({
    brand_id,
    year,
    q1_plan:     updated.q1_plan,
    q2_plan:     updated.q2_plan,
    q3_plan:     updated.q3_plan,
    q4_plan:     updated.q4_plan,
    fy_plan:     fy,
    fy_forecast: fc.fy,
    fy_gap:      computeGap(fy, fc.fy),
  });
});

export default router;
