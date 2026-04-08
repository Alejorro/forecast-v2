import { Router } from 'express';
import db from '../db.js';
import { STAGE_MAP, deriveTransaction, computeGap } from '../lib/forecast.js';

const router = Router();

// GET /api/overview?year=YYYY
router.get('/', (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();

  // All active non-deleted transactions for this year
  const activeTx = db.prepare(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.deleted_at IS NULL
      AND t.due_date IS NOT NULL
      AND CAST(strftime('%Y', t.due_date) AS INTEGER) = ?
  `).all(year);

  // All plans for this year
  const plans = db.prepare('SELECT * FROM plans WHERE year = ?').all(year);
  const brands = db.prepare('SELECT id, name FROM brands').all();

  // Build per-brand plan lookup
  const planByBrand = Object.fromEntries(plans.map(p => [p.brand_id, p]));

  // ── Aggregate transactions ──────────────────────────────────────────────
  const quarterly = { q1: { forecast: 0, won: 0 }, q2: { forecast: 0, won: 0 }, q3: { forecast: 0, won: 0 }, q4: { forecast: 0, won: 0 } };
  const stageMap  = {};   // stage_label → weighted_total (LOSS excluded)
  const brandFc   = {};   // brand_id → { q1..q4 }
  const brandWon  = {};   // brand_id → fy won total

  for (const tx of activeTx) {
    const isLoss = tx.stage_label === 'LOSS';
    const pct    = STAGE_MAP[tx.stage_label] ?? 0;
    const wt     = tx.tcv * pct;

    // Per-brand forecast init
    if (!brandFc[tx.brand_id])  brandFc[tx.brand_id]  = { q1: 0, q2: 0, q3: 0, q4: 0 };
    if (!brandWon[tx.brand_id]) brandWon[tx.brand_id] = 0;

    if (!isLoss) {
      const qVals = {
        q1: wt * tx.allocation_q1,
        q2: wt * tx.allocation_q2,
        q3: wt * tx.allocation_q3,
        q4: wt * tx.allocation_q4,
      };

      quarterly.q1.forecast += qVals.q1;
      quarterly.q2.forecast += qVals.q2;
      quarterly.q3.forecast += qVals.q3;
      quarterly.q4.forecast += qVals.q4;

      brandFc[tx.brand_id].q1 += qVals.q1;
      brandFc[tx.brand_id].q2 += qVals.q2;
      brandFc[tx.brand_id].q3 += qVals.q3;
      brandFc[tx.brand_id].q4 += qVals.q4;

      // pipeline_by_stage (exclude LOSS — already guarded above)
      stageMap[tx.stage_label] = (stageMap[tx.stage_label] ?? 0) + wt;
    }

    // Won totals (LOSS transactions are NOT Won, but just in case)
    if (tx.stage_label === 'Won' && !isLoss) {
      const wonVal = wt * (tx.allocation_q1 + tx.allocation_q2 + tx.allocation_q3 + tx.allocation_q4);
      // allocation sum = 1, so wonVal = wt
      quarterly.q1.won += wt * tx.allocation_q1;
      quarterly.q2.won += wt * tx.allocation_q2;
      quarterly.q3.won += wt * tx.allocation_q3;
      quarterly.q4.won += wt * tx.allocation_q4;
      brandWon[tx.brand_id] += wt;
    }
  }

  // ── Plan totals ──────────────────────────────────────────────────────────
  // total_plan is null if ANY brand has no plan row OR any quarter is null
  let total_plan      = 0;
  let anyNullPlan     = false;
  const qPlan         = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const anyQNullPlan  = { q1: false, q2: false, q3: false, q4: false };

  for (const brand of brands) {
    const p = planByBrand[brand.id];
    if (!p) { anyNullPlan = true; continue; }

    ['q1', 'q2', 'q3', 'q4'].forEach(q => {
      const val = p[`${q}_plan`];
      if (val === null) anyQNullPlan[q] = true;
      else qPlan[q] += val;
    });

    const fy = (p.q1_plan === null || p.q2_plan === null || p.q3_plan === null || p.q4_plan === null)
      ? null
      : p.q1_plan + p.q2_plan + p.q3_plan + p.q4_plan;

    if (fy === null) anyNullPlan = true;
    else total_plan += fy;
  }
  if (anyNullPlan) {
    total_plan = null;
    // If total plan is null, all quarterly plan aggregates are also null
    ['q1', 'q2', 'q3', 'q4'].forEach(q => { qPlan[q] = null; });
  } else {
    ['q1', 'q2', 'q3', 'q4'].forEach(q => { if (anyQNullPlan[q]) qPlan[q] = null; });
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const total_weighted_forecast = quarterly.q1.forecast + quarterly.q2.forecast + quarterly.q3.forecast + quarterly.q4.forecast;
  const total_won               = quarterly.q1.won      + quarterly.q2.won      + quarterly.q3.won      + quarterly.q4.won;
  const total_gap               = computeGap(total_plan, total_weighted_forecast);

  // ── Quarterly breakdown ──────────────────────────────────────────────────
  const quarterly_breakdown = ['q1', 'q2', 'q3', 'q4'].map((q, i) => ({
    quarter:  i + 1,
    plan:     qPlan[q],
    forecast: quarterly[q].forecast,
    won:      quarterly[q].won,
    gap:      computeGap(qPlan[q], quarterly[q].forecast),
  }));

  // ── Gap by brand ─────────────────────────────────────────────────────────
  const gap_by_brand = brands.map(brand => {
    const p    = planByBrand[brand.id];
    const fy   = p
      ? (p.q1_plan === null || p.q2_plan === null || p.q3_plan === null || p.q4_plan === null
          ? null
          : p.q1_plan + p.q2_plan + p.q3_plan + p.q4_plan)
      : null;
    const fc   = brandFc[brand.id] ? Object.values(brandFc[brand.id]).reduce((a, b) => a + b, 0) : 0;
    return {
      brand_id:   brand.id,
      brand_name: brand.name,
      plan:       fy,
      forecast:   fc,
      gap:        computeGap(fy, fc),
    };
  });

  // ── Pipeline by stage (LOSS excluded) ────────────────────────────────────
  const pipeline_by_stage = Object.entries(stageMap).map(([stage_label, weighted_total]) => ({
    stage_label,
    weighted_total,
  }));

  // ── Top opportunities: top 5 active, not Won, not LOSS ───────────────────
  const top_opportunities = activeTx
    .filter(tx => tx.stage_label !== 'Won' && tx.stage_label !== 'LOSS')
    .map(deriveTransaction)
    .sort((a, b) => b.weighted_total - a.weighted_total)
    .slice(0, 5);

  res.json({
    year,
    total_plan,
    total_weighted_forecast,
    total_won,
    total_gap,
    quarterly_breakdown,
    gap_by_brand,
    pipeline_by_stage,
    top_opportunities,
  });
});

export default router;
