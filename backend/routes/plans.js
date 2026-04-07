import { Router } from 'express';
import db from '../db.js';
import { STAGE_MAP, computeGap } from '../lib/forecast.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute forecast for a brand/year/quarter from transactions.
 * Returns weighted_total sum for active non-deleted transactions.
 */
function forecastForBrandYear(brand_id, year) {
  const rows = db.prepare(`
    SELECT tcv, stage_label,
           allocation_q1, allocation_q2, allocation_q3, allocation_q4
    FROM transactions
    WHERE brand_id = ?
      AND CAST(strftime('%Y', due_date) AS INTEGER) = ?
      AND deleted_at IS NULL
      AND (status_label IS NULL OR status_label != 'LOSS')
  `).all(Number(brand_id), Number(year));

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

/**
 * Compute fy_plan from a plan row.
 * If any quarter is null → fy_plan = null.
 */
function fyPlan(plan) {
  if (!plan) return null;
  const { q1_plan, q2_plan, q3_plan, q4_plan } = plan;
  if (q1_plan === null || q2_plan === null || q3_plan === null || q4_plan === null) return null;
  return q1_plan + q2_plan + q3_plan + q4_plan;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/plans?year=YYYY
router.get('/', (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();

  const brands = db.prepare('SELECT id, name FROM brands ORDER BY name ASC').all();
  const planRows = db.prepare('SELECT * FROM plans WHERE year = ?').all(year);
  const planByBrand = Object.fromEntries(planRows.map(p => [p.brand_id, p]));

  const result = brands.map(brand => {
    const plan = planByBrand[brand.id] || null;
    const fc   = forecastForBrandYear(brand.id, year);
    const fy   = fyPlan(plan);

    return {
      brand_id:         brand.id,
      brand_name:       brand.name,
      year,
      q1_plan:          plan?.q1_plan ?? null,
      q2_plan:          plan?.q2_plan ?? null,
      q3_plan:          plan?.q3_plan ?? null,
      q4_plan:          plan?.q4_plan ?? null,
      fy_plan:          fy,
      fy_forecast:      fc.fy,
      fy_gap:           computeGap(fy, fc.fy),
    };
  });

  res.json(result);
});

// GET /api/plans/:brand_id?year=YYYY
router.get('/:brand_id', (req, res) => {
  const brand_id = Number(req.params.brand_id);
  const year     = Number(req.query.year) || new Date().getUTCFullYear();

  const brand = db.prepare('SELECT id, name FROM brands WHERE id = ?').get(brand_id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const plan = db.prepare('SELECT * FROM plans WHERE brand_id = ? AND year = ?').get(brand_id, year);
  const fc   = forecastForBrandYear(brand_id, year);
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
      {
        quarter:  1,
        plan:     plan?.q1_plan ?? null,
        forecast: fc.q1,
        gap:      computeGap(plan?.q1_plan ?? null, fc.q1),
      },
      {
        quarter:  2,
        plan:     plan?.q2_plan ?? null,
        forecast: fc.q2,
        gap:      computeGap(plan?.q2_plan ?? null, fc.q2),
      },
      {
        quarter:  3,
        plan:     plan?.q3_plan ?? null,
        forecast: fc.q3,
        gap:      computeGap(plan?.q3_plan ?? null, fc.q3),
      },
      {
        quarter:  4,
        plan:     plan?.q4_plan ?? null,
        forecast: fc.q4,
        gap:      computeGap(plan?.q4_plan ?? null, fc.q4),
      },
    ],
    fy_forecast: fc.fy,
    fy_gap:      computeGap(fy, fc.fy),
  });
});

// PUT /api/plans/:brand_id — upsert
router.put('/:brand_id', (req, res) => {
  const brand_id = Number(req.params.brand_id);
  const body     = req.body;

  const brand = db.prepare('SELECT id FROM brands WHERE id = ?').get(brand_id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  if (!body.year) return res.status(400).json({ error: 'year is required' });

  const year    = Number(body.year);
  const q1_plan = body.q1_plan !== undefined ? (body.q1_plan === null ? null : Number(body.q1_plan)) : null;
  const q2_plan = body.q2_plan !== undefined ? (body.q2_plan === null ? null : Number(body.q2_plan)) : null;
  const q3_plan = body.q3_plan !== undefined ? (body.q3_plan === null ? null : Number(body.q3_plan)) : null;
  const q4_plan = body.q4_plan !== undefined ? (body.q4_plan === null ? null : Number(body.q4_plan)) : null;

  db.prepare(`
    INSERT INTO plans (year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan)
    VALUES (@year, @brand_id, @q1_plan, @q2_plan, @q3_plan, @q4_plan)
    ON CONFLICT(year, brand_id) DO UPDATE SET
      q1_plan = excluded.q1_plan,
      q2_plan = excluded.q2_plan,
      q3_plan = excluded.q3_plan,
      q4_plan = excluded.q4_plan
  `).run({ year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan });

  const updated = db.prepare('SELECT * FROM plans WHERE brand_id = ? AND year = ?').get(brand_id, year);
  const fy      = fyPlan(updated);
  const fc      = forecastForBrandYear(brand_id, year);

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
