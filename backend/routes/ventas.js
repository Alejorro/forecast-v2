import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { createOdooClient } from '../lib/odoo-client.js';
import { wrapAsyncRouter } from '../lib/async-route.js';

const router = Router();
wrapAsyncRouter(router);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getQuarter(dateStr) {
  if (!dateStr) return null;
  const m = new Date(dateStr).getMonth() + 1;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

// Rates stored with Odoo currency names: "USD", "US$", "PES", etc.
// Convention: 1 ARS = rate [currency]  (same as Odoo's res.currency.rate)
async function getFxRate(db, date, currencyName) {
  const res = await db.query(
    `SELECT rate, rate_date::text AS rate_date
     FROM fx_rates
     WHERE currency = $1 AND rate_date <= $2
     ORDER BY rate_date DESC LIMIT 1`,
    [currencyName, date]
  );
  return res.rows[0] || null;
}

// Port of PriceChecker's convert_to_usd (sync_odoo.py:28).
// currency names are exactly as Odoo returns them: "USD", "PES", "US$"
async function computeUsdOfficial(db, amount, currency, saleDate) {
  if (amount == null || !currency || !saleDate) return { usd: null, rate: null, rateDate: null };

  // Case A: already USD oficial → 1:1
  if (currency === 'USD') {
    return { usd: amount, rate: 1, rateDate: saleDate };
  }

  const rateUsd = await getFxRate(db, saleDate, 'USD');
  if (!rateUsd) {
    console.warn(`[ventas] No USD rate for ${saleDate}`);
    return { usd: null, rate: null, rateDate: null };
  }

  // Case B: PES (ARS) → price_usd = price * rate_usd
  if (currency === 'PES') {
    return { usd: amount * rateUsd.rate, rate: rateUsd.rate, rateDate: rateUsd.rate_date };
  }

  // Case C: US$ (blue) → ars = price / rate_usdd; usd = ars * rate_usd
  if (currency === 'US$') {
    const rateUsdd = await getFxRate(db, saleDate, 'US$');
    if (!rateUsdd) {
      console.warn(`[ventas] No US$ rate for ${saleDate}`);
      return { usd: null, rate: null, rateDate: null };
    }
    const ars = amount / rateUsdd.rate;
    return { usd: ars * rateUsd.rate, rate: rateUsdd.rate, rateDate: rateUsdd.rate_date };
  }

  console.warn(`[ventas] Unknown currency: ${currency}`);
  return { usd: null, rate: null, rateDate: null };
}

// Port of PriceChecker's sync_currency_rates (sync_odoo.py:49).
// Fetches all rates from res.currency.rate and upserts into fx_rates.
async function syncCurrencyRates(odoo) {
  const records = await odoo.searchRead(
    'res.currency.rate',
    [],
    ['name', 'rate', 'currency_id'],
    { limit: 10000 }
  );

  let count = 0;
  for (const r of records) {
    const rateDate     = r.name;
    const currencyName = Array.isArray(r.currency_id) ? r.currency_id[1] : null;
    const rateVal      = r.rate;
    if (!currencyName || !rateVal || !rateDate) continue;

    await pool.query(`
      INSERT INTO fx_rates (rate_date, currency, rate)
      VALUES ($1, $2, $3)
      ON CONFLICT (rate_date, currency) DO UPDATE SET rate = EXCLUDED.rate
    `, [rateDate, currencyName, rateVal]);
    count++;
  }
  return count;
}

async function findSellerId(db, odooUserId, sellerNameRaw) {
  if (odooUserId) {
    const res = await db.query('SELECT id FROM sellers WHERE odoo_user_id = $1', [odooUserId]);
    if (res.rows.length) return res.rows[0].id;
  }
  if (sellerNameRaw) {
    const normalized = sellerNameRaw.toLowerCase().trim();
    const compact = normalized.replace(/[^a-z0-9]/g, '');
    const res = await db.query(`
      SELECT id
      FROM sellers
      WHERE name_normalized = $1
         OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $2
      LIMIT 1
    `, [normalized, compact]);
    if (res.rows.length) return res.rows[0].id;
  }
  return null;
}

async function fetchAllSaleOrders(odoo) {
  const domain = [['state', 'in', ['draft', 'sent', 'sale', 'done']]];
  const fields = [
    'id', 'name', 'partner_id', 'user_id', 'brand_id', 'invoice_status',
    'state', 'date_order', 'currency_id', 'amount_total',
  ];
  const limit = 1000;
  const orders = [];

  for (let offset = 0; ; offset += limit) {
    const batch = await odoo.searchRead('sale.order', domain, fields, { limit, offset });
    orders.push(...batch);
    if (batch.length < limit) break;
  }

  return orders;
}

function buildWhereClause(query) {
  const { year, quarter, brand, seller_id, invoice_status, search } = query;
  const conditions = [];
  const bindings = [];

  if (year) {
    conditions.push(`so.year = $${bindings.length + 1}`);
    bindings.push(Number(year));
  }
  if (quarter) {
    conditions.push(`so.quarter = $${bindings.length + 1}`);
    bindings.push(quarter);
  }
  if (brand) {
    if (brand === '__no_brand__') {
      conditions.push('so.brand IS NULL');
    } else {
      conditions.push(`so.brand = $${bindings.length + 1}`);
      bindings.push(brand);
    }
  }
  if (seller_id) {
    conditions.push(`so.seller_id = $${bindings.length + 1}`);
    bindings.push(Number(seller_id));
  }
  if (invoice_status) {
    conditions.push(`so.invoice_status = $${bindings.length + 1}`);
    bindings.push(invoice_status);
  }
  if (search) {
    conditions.push(`so.client_name ILIKE $${bindings.length + 1}`);
    bindings.push(`%${search}%`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, bindings };
}

// ─── Summary / KPIs ──────────────────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  try {
    const { where, bindings } = buildWhereClause(req.query);

    const kpiRes = await pool.query(`
      SELECT
        COALESCE(SUM(so.amount_usd_official), 0)                                                                     AS total_empresa,
        COALESCE(SUM(CASE WHEN so.invoice_status = 'invoiced'   THEN so.amount_usd_official END), 0)                AS total_facturado,
        COALESCE(SUM(CASE WHEN so.invoice_status = 'to invoice' THEN so.amount_usd_official END), 0)               AS total_por_facturar,
        COUNT(*)::int                                                                                                 AS count
      FROM sales_odoo so
      ${where}
    `, bindings);

    const brandRes = await pool.query(`
      SELECT
        so.brand,
        COALESCE(SUM(CASE WHEN so.invoice_status = 'invoiced'   THEN so.amount_usd_official END), 0) AS facturado,
        COALESCE(SUM(CASE WHEN so.invoice_status = 'to invoice' THEN so.amount_usd_official END), 0) AS por_facturar
      FROM sales_odoo so
      ${where}
      GROUP BY so.brand
      ORDER BY (facturado + por_facturar) DESC NULLS LAST
    `, bindings);

    res.json({ kpis: kpiRes.rows[0], brands: brandRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Sellers in ventas ───────────────────────────────────────────────────────

router.get('/sellers', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT so.seller_id AS id, s.name
      FROM sales_odoo so
      JOIN sellers s ON so.seller_id = s.id
      WHERE so.seller_id IS NOT NULL
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Brands in ventas ────────────────────────────────────────────────────────

router.get('/brands', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT brand FROM sales_odoo
      WHERE brand IS NOT NULL ORDER BY brand
    `);
    res.json(result.rows.map(r => r.brand));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── FX Rates ─────────────────────────────────────────────────────────────────

router.get('/fx-rates', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM fx_rates ORDER BY rate_date DESC, currency ASC LIMIT 180'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/fx-rates', requireAdmin, async (req, res) => {
  try {
    const { rate_date, currency, rate } = req.body;
    if (!rate_date || !currency || rate == null) {
      return res.status(400).json({ error: 'rate_date, currency, rate are required. rate = 1 ARS in [currency] (Odoo convention)' });
    }
    const result = await pool.query(`
      INSERT INTO fx_rates (rate_date, currency, rate)
      VALUES ($1, $2, $3)
      ON CONFLICT (rate_date, currency) DO UPDATE SET rate = EXCLUDED.rate
      RETURNING *
    `, [rate_date, currency, Number(rate)]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Odoo Sync ────────────────────────────────────────────────────────────────

router.post('/sync', requireAdmin, async (_req, res) => {
  const syncAt = new Date();
  const warnings = [];
  let upserted = 0;
  let failed = 0;

  try {
    const odoo = createOdooClient();

    // Step 1: sync currency rates from Odoo (same as PriceChecker)
    const ratesCount = await syncCurrencyRates(odoo);
    console.log(`[ventas sync] currency rates upserted: ${ratesCount}`);

    // Step 2: fetch sale orders (invoiced + to invoice + quotations draft/sent)
    const orders = await fetchAllSaleOrders(odoo);

    for (const order of orders) {
      try {
        const saleDate = order.date_order ? order.date_order.split(' ')[0] : null;
        const quarter = getQuarter(saleDate);
        const year = saleDate ? new Date(saleDate).getFullYear() : null;

        const odooUserId    = Array.isArray(order.user_id)    ? order.user_id[0]    : null;
        const sellerNameRaw = Array.isArray(order.user_id)    ? order.user_id[1]    : null;
        const clientName    = Array.isArray(order.partner_id) ? order.partner_id[1] : null;
        const brand         = Array.isArray(order.brand_id)   ? order.brand_id[1]   : null;
        const currencyName  = Array.isArray(order.currency_id)? order.currency_id[1]: null;

        const sellerId = await findSellerId(pool, odooUserId, sellerNameRaw);
        if (!sellerId && sellerNameRaw) {
          warnings.push(`No seller match for Odoo user "${sellerNameRaw}" (uid=${odooUserId}), order ${order.name}`);
        }

        const { usd, rate, rateDate } = await computeUsdOfficial(pool, order.amount_total, currencyName, saleDate);
        if (usd === null && currencyName) {
          warnings.push(`Could not compute USD for order ${order.name} (currency: ${currencyName}, date: ${saleDate})`);
        }

        await pool.query(`
          INSERT INTO sales_odoo (
            odoo_sale_order_id, reference, client_name, seller_id, seller_name_raw,
            brand, invoice_status, order_state, sale_date, quarter, year,
            currency_original, amount_original, amount_usd_official,
            fx_rate_used, fx_rate_date_used, last_sync_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (odoo_sale_order_id) DO UPDATE SET
            reference           = EXCLUDED.reference,
            client_name         = EXCLUDED.client_name,
            seller_id           = EXCLUDED.seller_id,
            seller_name_raw     = EXCLUDED.seller_name_raw,
            brand               = EXCLUDED.brand,
            invoice_status      = EXCLUDED.invoice_status,
            order_state         = EXCLUDED.order_state,
            sale_date           = EXCLUDED.sale_date,
            quarter             = EXCLUDED.quarter,
            year                = EXCLUDED.year,
            currency_original   = EXCLUDED.currency_original,
            amount_original     = EXCLUDED.amount_original,
            amount_usd_official = EXCLUDED.amount_usd_official,
            fx_rate_used        = EXCLUDED.fx_rate_used,
            fx_rate_date_used   = EXCLUDED.fx_rate_date_used,
            last_sync_at        = EXCLUDED.last_sync_at
        `, [
          order.id, order.name, clientName, sellerId, sellerNameRaw,
          brand, order.invoice_status, order.state, saleDate, quarter, year,
          currencyName, order.amount_total, usd,
          rate, rateDate, syncAt,
        ]);

        upserted++;
      } catch (orderErr) {
        failed++;
        warnings.push(`Error on order ${order.id || '?'}: ${orderErr.message}`);
      }
    }

    res.json({ ok: true, fetched: orders.length, upserted, failed, warnings });
  } catch (err) {
    console.error('[ventas sync]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── List ─────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { where, bindings } = buildWhereClause(req.query);

    const result = await pool.query(`
      SELECT so.*, s.name AS seller_name
      FROM sales_odoo so
      LEFT JOIN sellers s ON so.seller_id = s.id
      ${where}
      ORDER BY so.sale_date DESC NULLS LAST, so.id DESC
    `, bindings);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Single ───────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT so.*, s.name AS seller_name
      FROM sales_odoo so
      LEFT JOIN sellers s ON so.seller_id = s.id
      WHERE so.id = $1
    `, [Number(req.params.id)]);

    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update internal fields ───────────────────────────────────────────────────

const VALID_HIGHLIGHT = ['green', 'yellow', 'orange', 'red'];

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { notes, provider, internal_tags, highlight_color } = req.body;

    if (highlight_color != null && !VALID_HIGHLIGHT.includes(highlight_color)) {
      return res.status(400).json({ error: 'Invalid highlight_color' });
    }

    const result = await pool.query(`
      UPDATE sales_odoo
      SET notes = $1, provider = $2, internal_tags = $3, highlight_color = $4
      WHERE id = $5
      RETURNING *
    `, [
      notes       ?? null,
      provider    ?? null,
      internal_tags ?? null,
      highlight_color ?? null,
      Number(req.params.id),
    ]);

    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
