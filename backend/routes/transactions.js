import { Router } from 'express';
import db from '../db.js';
import {
  deriveTransaction,
  validateStageLabel,
  validateStatusLabel,
  validateAllocations,
  validateDueDate,
} from '../lib/forecast.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildListQuery(params) {
  const conditions = ['t.deleted_at IS NULL'];
  const bindings = [];

  const { year, brand_id, seller_id, stage_label, quarter, include_loss, search } = params;

  if (year) {
    conditions.push("CAST(strftime('%Y', t.due_date) AS INTEGER) = ?");
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
    const q = Number(quarter);
    if (q >= 1 && q <= 4) {
      conditions.push(`t.allocation_q${q} > 0`);
    }
  }

  // By default exclude LOSS; include only when explicitly requested
  if (include_loss !== 'true') {
    conditions.push("(t.status_label IS NULL OR t.status_label != 'LOSS')");
  }

  if (search) {
    conditions.push('(t.client_name LIKE ? OR t.project_name LIKE ?)');
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, bindings };
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

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const statusErr = validateStatusLabel(body.status_label);
  if (statusErr) return res.status(400).json({ error: statusErr });

  const q1 = body.allocation_q1 ?? 0;
  const q2 = body.allocation_q2 ?? 0;
  const q3 = body.allocation_q3 ?? 0;
  const q4 = body.allocation_q4 ?? 0;
  const allocErr = validateAllocations(q1, q2, q3, q4);
  if (allocErr) return res.status(400).json({ error: allocErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });
  if (body.tcv === undefined || body.tcv === null) return res.status(400).json({ error: 'tcv is required' });

  const stmt = db.prepare(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, status_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes
    ) VALUES (
      @client_name, @project_name, @seller_id, @brand_id,
      @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
      @due_date, @stage_label, @status_label, @tcv,
      @allocation_q1, @allocation_q2, @allocation_q3, @allocation_q4,
      @description, @invoice_number, @notes
    )
  `);

  const result = stmt.run({
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
    status_label:             body.status_label             ?? null,
    tcv:                      Number(body.tcv),
    allocation_q1:            Number(q1),
    allocation_q2:            Number(q2),
    allocation_q3:            Number(q3),
    allocation_q4:            Number(q4),
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

  const stageErr = validateStageLabel(body.stage_label);
  if (stageErr) return res.status(400).json({ error: stageErr });

  const statusErr = validateStatusLabel(body.status_label);
  if (statusErr) return res.status(400).json({ error: statusErr });

  const q1 = body.allocation_q1 ?? 0;
  const q2 = body.allocation_q2 ?? 0;
  const q3 = body.allocation_q3 ?? 0;
  const q4 = body.allocation_q4 ?? 0;
  const allocErr = validateAllocations(q1, q2, q3, q4);
  if (allocErr) return res.status(400).json({ error: allocErr });

  const dueDateErr = validateDueDate(body.due_date);
  if (dueDateErr) return res.status(400).json({ error: dueDateErr });

  if (!body.client_name) return res.status(400).json({ error: 'client_name is required' });
  if (!body.seller_id)   return res.status(400).json({ error: 'seller_id is required' });
  if (!body.brand_id)    return res.status(400).json({ error: 'brand_id is required' });
  if (body.tcv === undefined || body.tcv === null) return res.status(400).json({ error: 'tcv is required' });

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
      status_label             = @status_label,
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
    status_label:             body.status_label             ?? null,
    tcv:                      Number(body.tcv),
    allocation_q1:            Number(q1),
    allocation_q2:            Number(q2),
    allocation_q3:            Number(q3),
    allocation_q4:            Number(q4),
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
      due_date, stage_label, status_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      description, invoice_number, notes
    ) VALUES (
      @client_name, @project_name, @seller_id, @brand_id,
      @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
      @due_date, @stage_label, @status_label, @tcv,
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
    status_label:             original.status_label,
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
