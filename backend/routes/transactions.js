import { Router } from 'express';
import pool from '../db.js';
import {
  deriveTransaction,
  validateStageLabel,
  quarterToAllocations,
  validateAllocations,
} from '../lib/forecast.js';
import { requireAdmin, requireWrite } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildListQuery(params) {
  const conditions = ['t.deleted_at IS NULL'];
  const bindings = [];

  const { year, brand_id, seller_id, stage_label, quarter, include_loss, search, transaction_type } = params;

  if (year) {
    conditions.push(`t.year = $${bindings.length + 1}`);
    bindings.push(Number(year));
  }

  if (brand_id) {
    conditions.push(`t.brand_id = $${bindings.length + 1}`);
    bindings.push(Number(brand_id));
  }

  if (seller_id) {
    conditions.push(`t.seller_id = $${bindings.length + 1}`);
    bindings.push(Number(seller_id));
  }

  if (stage_label) {
    conditions.push(`t.stage_label = $${bindings.length + 1}`);
    bindings.push(stage_label);
  }

  if (quarter) {
    const q = String(quarter).trim();
    if (q === 'Q1' || q === '1') conditions.push('t.allocation_q1 > 0');
    else if (q === 'Q2' || q === '2') conditions.push('t.allocation_q2 > 0');
    else if (q === 'Q3' || q === '3') conditions.push('t.allocation_q3 > 0');
    else if (q === 'Q4' || q === '4') conditions.push('t.allocation_q4 > 0');
    else if (q === 'Q1-Q4') conditions.push('t.allocation_q1 > 0 AND t.allocation_q2 > 0 AND t.allocation_q3 > 0 AND t.allocation_q4 > 0');
  }

  if (include_loss !== 'true') {
    conditions.push("t.stage_label != 'LOSS'");
  }

  if (transaction_type) {
    conditions.push(`t.transaction_type = $${bindings.length + 1}`);
    bindings.push(transaction_type);
  }

  if (search) {
    conditions.push(`(t.client_name ILIKE $${bindings.length + 1} OR t.project_name ILIKE $${bindings.length + 2})`);
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, bindings };
}

const VALID_HIGHLIGHT_COLORS = ['green', 'yellow', 'orange', 'red'];
const VALID_TRANSACTION_TYPES = ['BAU', 'EXPAND', 'NEW CLIENT'];

/** Returns the sanitized value (null if empty), or false if invalid. */
function validateHighlightColor(value) {
  if (!value) return null;
  if (!VALID_HIGHLIGHT_COLORS.includes(value)) return false;
  return value;
}

/** Returns the sanitized value (null if empty), or false if invalid. */
function validateTransactionType(value) {
  if (!value) return null;
  if (!VALID_TRANSACTION_TYPES.includes(value)) return false;
  return value;
}

function resolveAllocations(body) {
  if (body.quarter) {
    const alloc = quarterToAllocations(body.quarter);
    if (!alloc) return { error: `Invalid quarter "${body.quarter}". Must be one of: Q1, Q2, Q3, Q4, Q1-Q4` };
    return alloc;
  }
  return {
    allocation_q1: body.allocation_q1 ?? 0,
    allocation_q2: body.allocation_q2 ?? 0,
    allocation_q3: body.allocation_q3 ?? 0,
    allocation_q4: body.allocation_q4 ?? 0,
  };
}

function enforceSellerIdentity(user, submittedSellerId) {
  if (!user || user.role !== 'seller') return null;
  if (!user.sellerId) return 'Seller account not linked. Contact an admin.';
  if (Number(submittedSellerId) !== user.sellerId) {
    return 'You can only create transactions under your own seller identity';
  }
  return null;
}

function validateTcv(value, { allowZero = false } = {}) {
  if (value === undefined || value === null || value === '') return 'tcv is required';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'tcv must be a number';
  if (allowZero ? n < 0 : n <= 0) {
    return allowZero ? 'tcv must be zero or greater' : 'tcv must be greater than zero';
  }
  return null;
}

const TX_SELECT = `
  SELECT t.*, b.name AS brand_name, s.name AS seller_name
  FROM transactions t
  JOIN brands  b ON b.id = t.brand_id
  JOIN sellers s ON s.id = t.seller_id
`;

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/transactions
router.get('/', async (req, res) => {
  const params = { ...req.query };
  if (req.user?.role === 'seller') {
    params.seller_id = req.user.sellerId;
  }
  const { where, bindings } = buildListQuery(params);

  const { rows } = await pool.query(`
    ${TX_SELECT}
    ${where}
    ORDER BY t.created_at DESC
  `, bindings);

  res.json(rows.map(deriveTransaction));
});

// GET /api/transactions/:id
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`
    ${TX_SELECT}
    WHERE t.id = $1 AND t.deleted_at IS NULL
  `, [Number(req.params.id)]);

  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });

  if (req.user?.role === 'seller' && rows[0].seller_id !== req.user.sellerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(deriveTransaction(rows[0]));
});

// POST /api/transactions
router.post('/', requireWrite, async (req, res) => {
  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  const sellerErr = enforceSellerIdentity(req.user, body.seller_id);
  if (sellerErr) return res.status(403).json({ error: sellerErr });

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  if (isLossRow && !body.loss_reason?.trim()) {
    return res.status(400).json({ error: 'loss_reason is required when stage is LOSS' });
  }

  const highlightColor = validateHighlightColor(body.highlight_color);
  if (highlightColor === false) return res.status(400).json({ error: 'Invalid highlight_color' });

  const transactionType = validateTransactionType(body.transaction_type);
  if (transactionType === false) return res.status(400).json({ error: 'Invalid transaction_type' });

  const txYear = Number(body.year) || new Date().getFullYear();

  if (isLossRow) {
    const tcvErr = validateTcv(body.tcv ?? 0, { allowZero: true });
    if (tcvErr) return res.status(400).json({ error: tcvErr });
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;

    const { rows: inserted } = await pool.query(`
      INSERT INTO transactions (
        client_name, project_name, seller_id, brand_id,
        sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
        year, stage_label, status_label, tcv,
        allocation_q1, allocation_q2, allocation_q3, allocation_q4,
        description, invoice_number, notes, highlight_color, transaction_type,
        loss_reason, updated_by, loss_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, 'LOSS', 'LOSS', $10,
        0, 0, 0, 0,
        $11, $12, $13, $14, $15,
        $16, $17, NOW()
      ) RETURNING id
    `, [
      body.client_name,
      body.project_name             ?? null,
      Number(body.seller_id),
      Number(body.brand_id),
      body.sub_brand                ?? null,
      body.vendor_name              ?? null,
      body.opportunity_odoo         ?? null,
      body.brand_opportunity_number ?? null,
      txYear,
      tcv,
      body.description              ?? null,
      body.invoice_number           ?? null,
      body.notes                    ?? null,
      highlightColor,
      transactionType,
      body.loss_reason.trim(),
      req.user?.sellerName ?? req.user?.username ?? 'Admin',
    ]);

    const { rows: created } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
    const tx = deriveTransaction(created[0]);
    logActivity(pool, { action: 'create', entityId: tx.id, user: req.user, details: { client_name: tx.client_name, brand_name: tx.brand_name, stage_label: tx.stage_label, tcv: tx.tcv } });
    return res.status(201).json(tx);
  }

  const tcvErr = validateTcv(body.tcv);
  if (tcvErr) return res.status(400).json({ error: tcvErr });

  const allocResult = resolveAllocations(body);
  if (allocResult.error) return res.status(400).json({ error: allocResult.error });

  const { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } = allocResult;

  if (!body.quarter) {
    const allocErr = validateAllocations(allocation_q1, allocation_q2, allocation_q3, allocation_q4);
    if (allocErr) return res.status(400).json({ error: allocErr });
  }

  const { rows: inserted } = await pool.query(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      year, stage_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes, highlight_color, transaction_type,
      updated_by, won_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      $21, CASE WHEN $10 = 'Won' THEN NOW() ELSE NULL END
    ) RETURNING id
  `, [
    body.client_name,
    body.project_name             ?? null,
    Number(body.seller_id),
    Number(body.brand_id),
    body.sub_brand                ?? null,
    body.vendor_name              ?? null,
    body.opportunity_odoo         ?? null,
    body.brand_opportunity_number ?? null,
    txYear,
    body.stage_label,
    Number(body.tcv),
    Number(allocation_q1),
    Number(allocation_q2),
    Number(allocation_q3),
    Number(allocation_q4),
    body.description              ?? null,
    body.invoice_number           ?? null,
    body.notes                    ?? null,
    highlightColor,
    transactionType,
    req.user?.sellerName ?? req.user?.username ?? 'Admin',
  ]);

  const { rows: created } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
  const tx = deriveTransaction(created[0]);
  logActivity(pool, { action: 'create', entityId: tx.id, user: req.user, details: { client_name: tx.client_name, brand_name: tx.brand_name, stage_label: tx.stage_label, tcv: tx.tcv } });
  res.status(201).json(tx);
});

// PUT /api/transactions/:id — admin or seller (own only)
router.put('/:id', requireWrite, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await pool.query(
    'SELECT id, seller_id, stage_label, won_at, loss_at FROM transactions WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Transaction not found' });

  if (req.user?.role === 'seller' && existing[0].seller_id !== req.user.sellerId) {
    return res.status(403).json({ error: 'You can only edit your own transactions' });
  }

  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const sellerErr = enforceSellerIdentity(req.user, body.seller_id);
  if (sellerErr) return res.status(403).json({ error: sellerErr });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  if (isLossRow && !body.loss_reason?.trim()) {
    return res.status(400).json({ error: 'loss_reason is required when stage is LOSS' });
  }

  const highlightColor = validateHighlightColor(body.highlight_color);
  if (highlightColor === false) return res.status(400).json({ error: 'Invalid highlight_color' });

  const transactionType = validateTransactionType(body.transaction_type);
  if (transactionType === false) return res.status(400).json({ error: 'Invalid transaction_type' });

  if (isLossRow) {
    const tcvErr = validateTcv(body.tcv ?? 0, { allowZero: true });
    if (tcvErr) return res.status(400).json({ error: tcvErr });
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;
    const lossAt = existing[0].stage_label === 'LOSS' ? existing[0].loss_at : new Date().toISOString();

    await pool.query(`
      UPDATE transactions SET
        client_name              = $1,
        project_name             = $2,
        seller_id                = $3,
        brand_id                 = $4,
        sub_brand                = $5,
        vendor_name              = $6,
        opportunity_odoo         = $7,
        brand_opportunity_number = $8,
        stage_label              = 'LOSS',
        status_label             = 'LOSS',
        tcv                      = $9,
        allocation_q1            = 0,
        allocation_q2            = 0,
        allocation_q3            = 0,
        allocation_q4            = 0,
        description              = $10,
        invoice_number           = $11,
        notes                    = $12,
        highlight_color          = $13,
        transaction_type         = $14,
        loss_reason              = $15,
        updated_by               = $16,
        won_at                   = NULL,
        loss_at                  = $17,
        updated_at               = NOW()
      WHERE id = $18
    `, [
      body.client_name,
      body.project_name             ?? null,
      Number(body.seller_id),
      Number(body.brand_id),
      body.sub_brand                ?? null,
      body.vendor_name              ?? null,
      body.opportunity_odoo         ?? null,
      body.brand_opportunity_number ?? null,
      tcv,
      body.description              ?? null,
      body.invoice_number           ?? null,
      body.notes                    ?? null,
      highlightColor,
      transactionType,
      body.loss_reason.trim(),
      req.user?.sellerName ?? req.user?.username ?? 'Admin',
      lossAt,
      id,
    ]);

    const { rows: updated } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
    const tx = deriveTransaction(updated[0]);
    logActivity(pool, { action: 'edit', entityId: tx.id, user: req.user, details: { client_name: tx.client_name, brand_name: tx.brand_name, stage_label: tx.stage_label, tcv: tx.tcv, prev_stage: existing[0].stage_label } });
    return res.json(tx);
  }

  const tcvErr = validateTcv(body.tcv);
  if (tcvErr) return res.status(400).json({ error: tcvErr });

  const allocResult = resolveAllocations(body);
  if (allocResult.error) return res.status(400).json({ error: allocResult.error });

  const { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } = allocResult;

  if (!body.quarter) {
    const allocErr = validateAllocations(allocation_q1, allocation_q2, allocation_q3, allocation_q4);
    if (allocErr) return res.status(400).json({ error: allocErr });
  }

  const oldStage = existing[0].stage_label;
  const newStage = body.stage_label;
  const wonAt = newStage === 'Won'
    ? (oldStage === 'Won' ? existing[0].won_at : new Date().toISOString())
    : null;

  await pool.query(`
    UPDATE transactions SET
      client_name              = $1,
      project_name             = $2,
      seller_id                = $3,
      brand_id                 = $4,
      sub_brand                = $5,
      vendor_name              = $6,
      opportunity_odoo         = $7,
      brand_opportunity_number = $8,
      stage_label              = $9,
      status_label             = NULL,
      tcv                      = $10,
      allocation_q1            = $11,
      allocation_q2            = $12,
      allocation_q3            = $13,
      allocation_q4            = $14,
      description              = $15,
      invoice_number           = $16,
      notes                    = $17,
      highlight_color          = $18,
      transaction_type         = $19,
      loss_reason              = NULL,
      updated_by               = $20,
      won_at                   = $21,
      loss_at                  = NULL,
      updated_at               = NOW()
    WHERE id = $22
  `, [
    body.client_name,
    body.project_name             ?? null,
    Number(body.seller_id),
    Number(body.brand_id),
    body.sub_brand                ?? null,
    body.vendor_name              ?? null,
    body.opportunity_odoo         ?? null,
    body.brand_opportunity_number ?? null,
    body.stage_label,
    Number(body.tcv),
    Number(allocation_q1),
    Number(allocation_q2),
    Number(allocation_q3),
    Number(allocation_q4),
    body.description              ?? null,
    body.invoice_number           ?? null,
    body.notes                    ?? null,
    highlightColor,
    transactionType,
    req.user?.sellerName ?? req.user?.username ?? 'Admin',
    wonAt,
    id,
  ]);

  const { rows: updated } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
  const txUpdated = deriveTransaction(updated[0]);
  logActivity(pool, { action: 'edit', entityId: txUpdated.id, user: req.user, details: { client_name: txUpdated.client_name, brand_name: txUpdated.brand_name, stage_label: txUpdated.stage_label, tcv: txUpdated.tcv, prev_stage: oldStage } });
  res.json(txUpdated);
});

// DELETE /api/transactions/:id — soft delete, admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await pool.query(
    'SELECT id, client_name, stage_label, tcv, brand_id FROM transactions WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Transaction not found' });

  await pool.query(
    'UPDATE transactions SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]
  );
  logActivity(pool, { action: 'delete', entityId: id, user: req.user, details: { client_name: existing[0].client_name, stage_label: existing[0].stage_label, tcv: existing[0].tcv } });
  res.json({ ok: true });
});

// POST /api/transactions/:id/duplicate — clone transaction
router.post('/:id/duplicate', requireWrite, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: origRows } = await pool.query(
    'SELECT * FROM transactions WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  if (!origRows[0]) return res.status(404).json({ error: 'Transaction not found' });

  const original = origRows[0];

  const sellerErr = enforceSellerIdentity(req.user, original.seller_id);
  if (sellerErr) return res.status(403).json({ error: sellerErr });

  const { rows: inserted } = await pool.query(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, year, stage_label, status_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes, highlight_color, transaction_type,
      loss_reason, updated_by, won_at, loss_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20, $21, $22,
      $23, $24,
      CASE WHEN $11 = 'Won' THEN NOW() ELSE NULL END,
      CASE WHEN $11 = 'LOSS' THEN NOW() ELSE NULL END
    ) RETURNING id
  `, [
    original.client_name,
    original.project_name,
    original.seller_id,
    original.brand_id,
    original.sub_brand,
    original.vendor_name,
    original.opportunity_odoo,
    original.brand_opportunity_number,
    original.due_date,
    original.year,
    original.stage_label,
    original.status_label,
    original.tcv,
    original.allocation_q1,
    original.allocation_q2,
    original.allocation_q3,
    original.allocation_q4,
    original.description,
    original.invoice_number,
    original.notes,
    original.highlight_color     ?? null,
    original.transaction_type    ?? null,
    original.loss_reason         ?? null,
    req.user?.sellerName ?? req.user?.username ?? 'Admin',
  ]);

  const { rows: cloned } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
  const txCloned = deriveTransaction(cloned[0]);
  logActivity(pool, { action: 'duplicate', entityId: txCloned.id, user: req.user, details: { client_name: txCloned.client_name, brand_name: txCloned.brand_name, stage_label: txCloned.stage_label, tcv: txCloned.tcv, source_id: id } });
  res.status(201).json(txCloned);
});

export default router;
