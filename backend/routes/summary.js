import { Router } from 'express';
import pool from '../db.js';
import { STAGE_MAP, deriveTransaction, computeGap } from '../lib/forecast.js';

const router = Router();

// ─── GET /api/brands/:id/summary?year=YYYY ───────────────────────────────────
router.get('/brands/:id/summary', async (req, res) => {
  const brand_id = Number(req.params.id);
  const year     = Number(req.query.year) || new Date().getUTCFullYear();

  const { rows: brandRows } = await pool.query('SELECT id, name FROM brands WHERE id = $1', [brand_id]);
  const brand = brandRows[0];
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const { rows: planRows } = await pool.query('SELECT * FROM plans WHERE brand_id = $1 AND year = $2', [brand_id, year]);
  const plan = planRows[0] ?? null;
  const fy_plan = plan
    ? (plan.q1_plan === null || plan.q2_plan === null || plan.q3_plan === null || plan.q4_plan === null
        ? null
        : plan.q1_plan + plan.q2_plan + plan.q3_plan + plan.q4_plan)
    : null;

  const { rows: txRows } = await pool.query(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.brand_id = $1
      AND t.deleted_at IS NULL
      AND t.year = $2
  `, [brand_id, year]);

  const qFc  = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const qWon = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const stageAgg = {};

  for (const tx of txRows) {
    const isLoss = tx.stage_label === 'LOSS';
    const pct    = STAGE_MAP[tx.stage_label] ?? 0;
    const wt     = tx.tcv * pct;

    if (!isLoss) {
      qFc.q1 += wt * tx.allocation_q1;
      qFc.q2 += wt * tx.allocation_q2;
      qFc.q3 += wt * tx.allocation_q3;
      qFc.q4 += wt * tx.allocation_q4;
      stageAgg[tx.stage_label] = (stageAgg[tx.stage_label] ?? 0) + wt;
    }

    if (tx.stage_label === 'Won' && !isLoss) {
      qWon.q1 += wt * tx.allocation_q1;
      qWon.q2 += wt * tx.allocation_q2;
      qWon.q3 += wt * tx.allocation_q3;
      qWon.q4 += wt * tx.allocation_q4;
    }
  }

  const fy_forecast = qFc.q1 + qFc.q2 + qFc.q3 + qFc.q4;
  const fy_won      = qWon.q1 + qWon.q2 + qWon.q3 + qWon.q4;

  const quarterly_breakdown = ['q1', 'q2', 'q3', 'q4'].map((q, i) => ({
    quarter:  i + 1,
    plan:     plan ? (plan[`${q}_plan`] ?? null) : null,
    forecast: qFc[q],
    won:      qWon[q],
    gap:      computeGap(plan ? (plan[`${q}_plan`] ?? null) : null, qFc[q]),
  }));

  const pipeline_by_stage = Object.entries(stageAgg).map(([stage_label, weighted_total]) => ({
    stage_label,
    weighted_total,
  }));

  const top_transactions = txRows
    .filter(tx => tx.stage_label !== 'Won' && tx.stage_label !== 'LOSS')
    .map(deriveTransaction)
    .sort((a, b) => b.weighted_total - a.weighted_total)
    .slice(0, 10);

  res.json({
    brand_id,
    brand_name:  brand.name,
    year,
    plan:        fy_plan,
    forecast:    fy_forecast,
    won:         fy_won,
    gap:         computeGap(fy_plan, fy_forecast),
    quarterly_breakdown,
    pipeline_by_stage,
    top_transactions,
  });
});

// ─── GET /api/sellers/summary?year=YYYY ─────────────────────────────────────
router.get('/sellers/summary', async (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();

  const { rows: sellers } = await pool.query('SELECT id, name FROM sellers ORDER BY name ASC');

  const { rows: txRows } = await pool.query(`
    SELECT t.seller_id, t.tcv, t.stage_label,
           t.allocation_q1, t.allocation_q2, t.allocation_q3, t.allocation_q4
    FROM transactions t
    WHERE t.deleted_at IS NULL
      AND t.year = $1
  `, [year]);

  const agg = {};
  for (const tx of txRows) {
    const isLoss = tx.stage_label === 'LOSS';
    const pct    = STAGE_MAP[tx.stage_label] ?? 0;
    const wt     = tx.tcv * pct;

    if (!agg[tx.seller_id]) {
      agg[tx.seller_id] = { deal_count: 0, tcv_total: 0, weighted_forecast: 0, won: 0 };
    }

    agg[tx.seller_id].deal_count += 1;
    agg[tx.seller_id].tcv_total  += tx.tcv;

    if (!isLoss) {
      agg[tx.seller_id].weighted_forecast += wt;
    }

    if (tx.stage_label === 'Won' && !isLoss) {
      agg[tx.seller_id].won += wt;
    }
  }

  const total_forecast = Object.values(agg).reduce((sum, s) => sum + s.weighted_forecast, 0);

  const result = sellers.map(seller => {
    const s = agg[seller.id] ?? { deal_count: 0, tcv_total: 0, weighted_forecast: 0, won: 0 };
    return {
      seller_id:         seller.id,
      seller_name:       seller.name,
      deal_count:        s.deal_count,
      tcv_total:         s.tcv_total,
      weighted_forecast: s.weighted_forecast,
      won:               s.won,
      contribution_pct:  total_forecast > 0 ? (s.weighted_forecast / total_forecast) * 100 : 0,
    };
  });

  res.json(result);
});

export default router;
