import { Router } from 'express';
import pool from '../db.js';
import {
  deriveTransaction,
  validateStageLabel,
  validateQuarter,
  validateDueDate,
  quarterToAllocations,
  STAGE_MAP,
} from '../lib/forecast.js';
import { requireAdmin, requireWrite } from '../middleware/auth.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildListQuery(params) {
  const conditions = ['t.deleted_at IS NULL'];
  const bindings = [];

  const { year, brand_id, seller_id, stage_label, quarter, include_loss, search } = params;

  if (year) {
    if (include_loss === 'true') {
      conditions.push(`(t.due_date IS NULL OR EXTRACT(YEAR FROM t.due_date::date)::int = $${bindings.length + 1})`);
    } else {
      conditions.push(`EXTRACT(YEAR FROM t.due_date::date)::int = $${bindings.length + 1}`);
    }
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

  if (include_loss === 'true') {
    conditions.push("t.stage_label = 'LOSS'");
  } else {
    conditions.push("t.stage_label != 'LOSS'");
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
    if (!alloc) return { error: `Invalid quarter "${body.quarter}". Must be one of: Q1, Q2, Q3, Q4, 1Q-4Q` };
    return alloc;
  }
  return {
    allocation_q1: body.allocation_q1 ?? 0,
    allocation_q2: body.allocation_q2 ?? 0,
    allocation_q3: body.allocation_q3 ?? 0,
    allocation_q4: body.allocation_q4 ?? 0,
  };
}

async function enforceSellerIdentity(user, submittedSellerId) {
  if (!user || user.role !== 'seller') return null;

  const { rows } = await pool.query(
    'SELECT id FROM sellers WHERE name_normalized = $1',
    [user.sellerName.toLowerCase().trim()]
  );

  if (!rows[0]) {
    return `Seller account not found in database for: ${user.sellerName}`;
  }

  if (Number(submittedSellerId) !== rows[0].id) {
    return 'You can only create transactions under your own seller identity';
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
  const { where, bindings } = buildListQuery(req.query);

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
  res.json(deriveTransaction(rows[0]));
});

// POST /api/transactions
router.post('/', requireWrite, async (req, res) => {
  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  const sellerErr = await enforceSellerIdentity(req.user, body.seller_id);
  if (sellerErr) return res.status(403).json({ error: sellerErr });

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  const highlightColor = validateHighlightColor(body.highlight_color);
  if (highlightColor === false) return res.status(400).json({ error: 'Invalid highlight_color' });

  const transactionType = validateTransactionType(body.transaction_type);
  if (transactionType === false) return res.status(400).json({ error: 'Invalid transaction_type' });

  if (isLossRow) {
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;

    const { rows: inserted } = await pool.query(`
      INSERT INTO transactions (
        client_name, project_name, seller_id, brand_id,
        sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
        due_date, stage_label, status_label, tcv,
        allocation_q1, allocation_q2, allocation_q3, allocation_q4,
        description, invoice_number, notes, highlight_color, transaction_type
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, 'LOSS', 'LOSS', $10,
        0, 0, 0, 0,
        $11, $12, $13, $14, $15
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
      body.due_date                 ?? null,
      tcv,
      body.description              ?? null,
      body.invoice_number           ?? null,
      body.notes                    ?? null,
      highlightColor,
      transactionType,
    ]);

    const { rows: created } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
    return res.status(201).json(deriveTransaction(created[0]));
  }

  if (body.tcv === undefined || body.tcv === null) return res.status(400).json({ error: 'tcv is required' });

  const allocResult = resolveAllocations(body);
  if (allocResult.error) return res.status(400).json({ error: allocResult.error });

  const { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } = allocResult;

  if (!body.quarter) {
    const sum = allocation_q1 + allocation_q2 + allocation_q3 + allocation_q4;
    if (Math.abs(sum - 1.0) > 0.001) {
      return res.status(400).json({ error: `Allocations must sum to 1.0 (got ${sum.toFixed(4)})` });
    }
  }

  const { rows: inserted } = await pool.query(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes, highlight_color, transaction_type
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18, $19, $20
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
    body.due_date                 ?? null,
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
  ]);

  const { rows: created } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
  res.status(201).json(deriveTransaction(created[0]));
});

// PUT /api/transactions/:id — admin only
router.put('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await pool.query(
    'SELECT id FROM transactions WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Transaction not found' });

  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  const highlightColor = validateHighlightColor(body.highlight_color);
  if (highlightColor === false) return res.status(400).json({ error: 'Invalid highlight_color' });

  const transactionType = validateTransactionType(body.transaction_type);
  if (transactionType === false) return res.status(400).json({ error: 'Invalid transaction_type' });

  if (isLossRow) {
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;

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
        due_date                 = $9,
        stage_label              = 'LOSS',
        status_label             = 'LOSS',
        tcv                      = $10,
        allocation_q1            = 0,
        allocation_q2            = 0,
        allocation_q3            = 0,
        allocation_q4            = 0,
        description              = $11,
        invoice_number           = $12,
        notes                    = $13,
        highlight_color          = $14,
        transaction_type         = $15,
        updated_at               = NOW()
      WHERE id = $16
    `, [
      body.client_name,
      body.project_name             ?? null,
      Number(body.seller_id),
      Number(body.brand_id),
      body.sub_brand                ?? null,
      body.vendor_name              ?? null,
      body.opportunity_odoo         ?? null,
      body.brand_opportunity_number ?? null,
      body.due_date                 ?? null,
      tcv,
      body.description              ?? null,
      body.invoice_number           ?? null,
      body.notes                    ?? null,
      highlightColor,
      transactionType,
      id,
    ]);

    const { rows: updated } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
    return res.json(deriveTransaction(updated[0]));
  }

  if (body.tcv === undefined || body.tcv === null) return res.status(400).json({ error: 'tcv is required' });

  const allocResult = resolveAllocations(body);
  if (allocResult.error) return res.status(400).json({ error: allocResult.error });

  const { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } = allocResult;

  if (!body.quarter) {
    const sum = allocation_q1 + allocation_q2 + allocation_q3 + allocation_q4;
    if (Math.abs(sum - 1.0) > 0.001) {
      return res.status(400).json({ error: `Allocations must sum to 1.0 (got ${sum.toFixed(4)})` });
    }
  }

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
      due_date                 = $9,
      stage_label              = $10,
      tcv                      = $11,
      allocation_q1            = $12,
      allocation_q2            = $13,
      allocation_q3            = $14,
      allocation_q4            = $15,
      description              = $16,
      invoice_number           = $17,
      notes                    = $18,
      highlight_color          = $19,
      transaction_type         = $20,
      updated_at               = NOW()
    WHERE id = $21
  `, [
    body.client_name,
    body.project_name             ?? null,
    Number(body.seller_id),
    Number(body.brand_id),
    body.sub_brand                ?? null,
    body.vendor_name              ?? null,
    body.opportunity_odoo         ?? null,
    body.brand_opportunity_number ?? null,
    body.due_date                 ?? null,
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
    id,
  ]);

  const { rows: updated } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
  res.json(deriveTransaction(updated[0]));
});

// DELETE /api/transactions/:id — soft delete, admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existing } = await pool.query(
    'SELECT id FROM transactions WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Transaction not found' });

  await pool.query(
    'UPDATE transactions SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]
  );
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

  const sellerErr = await enforceSellerIdentity(req.user, original.seller_id);
  if (sellerErr) return res.status(403).json({ error: sellerErr });

  const { rows: inserted } = await pool.query(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes, highlight_color, transaction_type
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18, $19, $20
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
    original.stage_label,
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
  ]);

  const { rows: cloned } = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [inserted[0].id]);
  res.status(201).json(deriveTransaction(cloned[0]));
});

export default router;
