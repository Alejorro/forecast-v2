import { Router } from 'express';
import db from '../db.js';
import {
  deriveTransaction,
  validateStageLabel,
  validateQuarter,
  validateDueDate,
  quarterToAllocations,
  STAGE_MAP,
} from '../lib/forecast.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildListQuery(params) {
  const conditions = ['t.deleted_at IS NULL'];
  const bindings = [];

  const { year, brand_id, seller_id, stage_label, quarter, include_loss, search } = params;

  if (year) {
    if (include_loss === 'true') {
      // LOSS transactions may have no due_date — include them regardless of year
      conditions.push("(t.due_date IS NULL OR CAST(strftime('%Y', t.due_date) AS INTEGER) = ?)");
    } else {
      conditions.push("CAST(strftime('%Y', t.due_date) AS INTEGER) = ?");
    }
    bindings.push(Number(year));
  }

  if (brand_id) {
    conditions.push('t.brand_id = ?');
    bindings.push(Number(brand_id));
  }

  if (seller_id) {
    conditions.push('t.seller_id = ?');
    bindings.push(Number(seller_id));
  }

  if (stage_label) {
    conditions.push('t.stage_label = ?');
    bindings.push(stage_label);
  }

  if (quarter) {
    // Accept both numeric (1-4) and string (Q1-Q4, 1Q-4Q) forms
    const q = String(quarter).trim();
    if (q === 'Q1' || q === '1') conditions.push('t.allocation_q1 > 0');
    else if (q === 'Q2' || q === '2') conditions.push('t.allocation_q2 > 0');
    else if (q === 'Q3' || q === '3') conditions.push('t.allocation_q3 > 0');
    else if (q === 'Q4' || q === '4') conditions.push('t.allocation_q4 > 0');
    // 1Q-4Q: all quarters, no additional filter needed
  }

  if (include_loss === 'true') {
    conditions.push("t.stage_label = 'LOSS'");
  } else {
    conditions.push("t.stage_label != 'LOSS'");
  }

  if (search) {
    conditions.push('(t.client_name LIKE ? OR t.project_name LIKE ?)');
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, bindings };
}

/**
 * Resolves allocations from a request body.
 * If `quarter` field is provided, derive allocations from it.
 * Otherwise fall back to explicit allocation_qN fields (legacy / manual override).
 * Returns { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } or null on error.
 */
function resolveAllocations(body) {
  if (body.quarter) {
    const alloc = quarterToAllocations(body.quarter);
    if (!alloc) return { error: `Invalid quarter "${body.quarter}". Must be one of: Q1, Q2, Q3, Q4, 1Q-4Q` };
    return alloc;
  }
  // Explicit allocations provided directly
  return {
    allocation_q1: body.allocation_q1 ?? 0,
    allocation_q2: body.allocation_q2 ?? 0,
    allocation_q3: body.allocation_q3 ?? 0,
    allocation_q4: body.allocation_q4 ?? 0,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/transactions
router.get('/', (req, res) => {
  const { where, bindings } = buildListQuery(req.query);

  const rows = db.prepare(`
    SELECT t.*,
           b.name AS brand_name,
           s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    ${where}
    ORDER BY t.created_at DESC
  `).all(...bindings);

  res.json(rows.map(deriveTransaction));
});

// GET /api/transactions/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*,
           b.name AS brand_name,
           s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(Number(req.params.id));

  if (!row) return res.status(404).json({ error: 'Transaction not found' });
  res.json(deriveTransaction(row));
});

// POST /api/transactions
router.post('/', (req, res) => {
  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  if (isLossRow) {
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;

    const result = db.prepare(`
      INSERT INTO transactions (
        client_name, project_name, seller_id, brand_id,
        sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
        due_date, stage_label, status_label, tcv,
        allocation_q1, allocation_q2, allocation_q3, allocation_q4,
        description, invoice_number, notes
      ) VALUES (
        @client_name, @project_name, @seller_id, @brand_id,
        @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
        @due_date, 'LOSS', 'LOSS', @tcv,
        0, 0, 0, 0,
        @description, @invoice_number, @notes
      )
    `).run({
      client_name:              body.client_name,
      project_name:             body.project_name             ?? null,
      seller_id:                Number(body.seller_id),
      brand_id:                 Number(body.brand_id),
      sub_brand:                body.sub_brand                ?? null,
      vendor_name:              body.vendor_name              ?? null,
      opportunity_odoo:         body.opportunity_odoo         ?? null,
      brand_opportunity_number: body.brand_opportunity_number ?? null,
      due_date:                 body.due_date                 ?? null,
      tcv,
      description:              body.description              ?? null,
      invoice_number:           body.invoice_number           ?? null,
      notes:                    body.notes                    ?? null,
    });

    const created = db.prepare(`
      SELECT t.*, b.name AS brand_name, s.name AS seller_name
      FROM transactions t
      JOIN brands  b ON b.id = t.brand_id
      JOIN sellers s ON s.id = t.seller_id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json(deriveTransaction(created));
  }

  // Active deal: strict validation
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

  const result = db.prepare(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes
    ) VALUES (
      @client_name, @project_name, @seller_id, @brand_id,
      @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
      @due_date, @stage_label, @tcv,
      @allocation_q1, @allocation_q2, @allocation_q3, @allocation_q4,
      @description, @invoice_number, @notes
    )
  `).run({
    client_name:              body.client_name,
    project_name:             body.project_name             ?? null,
    seller_id:                Number(body.seller_id),
    brand_id:                 Number(body.brand_id),
    sub_brand:                body.sub_brand                ?? null,
    vendor_name:              body.vendor_name              ?? null,
    opportunity_odoo:         body.opportunity_odoo         ?? null,
    brand_opportunity_number: body.brand_opportunity_number ?? null,
    due_date:                 body.due_date                 ?? null,
    stage_label:              body.stage_label,
    tcv:                      Number(body.tcv),
    allocation_q1:            Number(allocation_q1),
    allocation_q2:            Number(allocation_q2),
    allocation_q3:            Number(allocation_q3),
    allocation_q4:            Number(allocation_q4),
    description:              body.description              ?? null,
    invoice_number:           body.invoice_number           ?? null,
    notes:                    body.notes                    ?? null,
  });

  const created = db.prepare(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(deriveTransaction(created));
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const body = req.body;
  const isLossRow = body.stage_label === 'LOSS';

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  if (isLossRow) {
    const tcv = body.tcv !== undefined && body.tcv !== null ? Number(body.tcv) : 0;

    db.prepare(`
      UPDATE transactions SET
        client_name              = @client_name,
        project_name             = @project_name,
        seller_id                = @seller_id,
        brand_id                 = @brand_id,
        sub_brand                = @sub_brand,
        vendor_name              = @vendor_name,
        opportunity_odoo         = @opportunity_odoo,
        brand_opportunity_number = @brand_opportunity_number,
        due_date                 = @due_date,
        stage_label              = 'LOSS',
        status_label             = 'LOSS',
        tcv                      = @tcv,
        allocation_q1            = 0,
        allocation_q2            = 0,
        allocation_q3            = 0,
        allocation_q4            = 0,
        description              = @description,
        invoice_number           = @invoice_number,
        notes                    = @notes,
        updated_at               = datetime('now')
      WHERE id = @id
    `).run({
      id,
      client_name:              body.client_name,
      project_name:             body.project_name             ?? null,
      seller_id:                Number(body.seller_id),
      brand_id:                 Number(body.brand_id),
      sub_brand:                body.sub_brand                ?? null,
      vendor_name:              body.vendor_name              ?? null,
      opportunity_odoo:         body.opportunity_odoo         ?? null,
      brand_opportunity_number: body.brand_opportunity_number ?? null,
      due_date:                 body.due_date                 ?? null,
      tcv,
      description:              body.description              ?? null,
      invoice_number:           body.invoice_number           ?? null,
      notes:                    body.notes                    ?? null,
    });

    const updated = db.prepare(`
      SELECT t.*, b.name AS brand_name, s.name AS seller_name
      FROM transactions t
      JOIN brands  b ON b.id = t.brand_id
      JOIN sellers s ON s.id = t.seller_id
      WHERE t.id = ?
    `).get(id);

    return res.json(deriveTransaction(updated));
  }

  // Active deal: strict validation
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

  db.prepare(`
    UPDATE transactions SET
      client_name              = @client_name,
      project_name             = @project_name,
      seller_id                = @seller_id,
      brand_id                 = @brand_id,
      sub_brand                = @sub_brand,
      vendor_name              = @vendor_name,
      opportunity_odoo         = @opportunity_odoo,
      brand_opportunity_number = @brand_opportunity_number,
      due_date                 = @due_date,
      stage_label              = @stage_label,
      tcv                      = @tcv,
      allocation_q1            = @allocation_q1,
      allocation_q2            = @allocation_q2,
      allocation_q3            = @allocation_q3,
      allocation_q4            = @allocation_q4,
      description              = @description,
      invoice_number           = @invoice_number,
      notes                    = @notes,
      updated_at               = datetime('now')
    WHERE id = @id
  `).run({
    id,
    client_name:              body.client_name,
    project_name:             body.project_name             ?? null,
    seller_id:                Number(body.seller_id),
    brand_id:                 Number(body.brand_id),
    sub_brand:                body.sub_brand                ?? null,
    vendor_name:              body.vendor_name              ?? null,
    opportunity_odoo:         body.opportunity_odoo         ?? null,
    brand_opportunity_number: body.brand_opportunity_number ?? null,
    due_date:                 body.due_date                 ?? null,
    stage_label:              body.stage_label,
    tcv:                      Number(body.tcv),
    allocation_q1:            Number(allocation_q1),
    allocation_q2:            Number(allocation_q2),
    allocation_q3:            Number(allocation_q3),
    allocation_q4:            Number(allocation_q4),
    description:              body.description              ?? null,
    invoice_number:           body.invoice_number           ?? null,
    notes:                    body.notes                    ?? null,
  });

  const updated = db.prepare(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.id = ?
  `).get(id);

  res.json(deriveTransaction(updated));
});

// DELETE /api/transactions/:id — soft delete
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  db.prepare("UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});

// POST /api/transactions/:id/duplicate — clone transaction
router.post('/:id/duplicate', (req, res) => {
  const id = Number(req.params.id);
  const original = db.prepare('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!original) return res.status(404).json({ error: 'Transaction not found' });

  const result = db.prepare(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes
    ) VALUES (
      @client_name, @project_name, @seller_id, @brand_id,
      @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
      @due_date, @stage_label, @tcv,
      @allocation_q1, @allocation_q2, @allocation_q3, @allocation_q4,
      @description, @invoice_number, @notes
    )
  `).run({
    client_name:              original.client_name,
    project_name:             original.project_name,
    seller_id:                original.seller_id,
    brand_id:                 original.brand_id,
    sub_brand:                original.sub_brand,
    vendor_name:              original.vendor_name,
    opportunity_odoo:         original.opportunity_odoo,
    brand_opportunity_number: original.brand_opportunity_number,
    due_date:                 original.due_date,
    stage_label:              original.stage_label,
    tcv:                      original.tcv,
    allocation_q1:            original.allocation_q1,
    allocation_q2:            original.allocation_q2,
    allocation_q3:            original.allocation_q3,
    allocation_q4:            original.allocation_q4,
    description:              original.description,
    invoice_number:           original.invoice_number,
    notes:                    original.notes,
  });

  const cloned = db.prepare(`
    SELECT t.*, b.name AS brand_name, s.name AS seller_name
    FROM transactions t
    JOIN brands  b ON b.id = t.brand_id
    JOIN sellers s ON s.id = t.seller_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(deriveTransaction(cloned));
});

export default router;
