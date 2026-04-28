CREATE TABLE IF NOT EXISTS brands (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sellers (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  name_normalized TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_name_normalized ON sellers(name_normalized);

CREATE TABLE IF NOT EXISTS plans (
  id       SERIAL PRIMARY KEY,
  year     INTEGER NOT NULL,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  q1_plan  REAL,
  q2_plan  REAL,
  q3_plan  REAL,
  q4_plan  REAL,
  UNIQUE(year, brand_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                       SERIAL PRIMARY KEY,
  client_name              TEXT    NOT NULL,
  project_name             TEXT,
  seller_id                INTEGER NOT NULL REFERENCES sellers(id),
  brand_id                 INTEGER NOT NULL REFERENCES brands(id),
  sub_brand                TEXT,
  vendor_name              TEXT,
  opportunity_odoo         TEXT,
  brand_opportunity_number TEXT,
  due_date                 TEXT,
  stage_label              TEXT    NOT NULL,
  status_label             TEXT,
  tcv                      REAL    NOT NULL,
  allocation_q1            REAL    NOT NULL DEFAULT 0,
  allocation_q2            REAL    NOT NULL DEFAULT 0,
  allocation_q3            REAL    NOT NULL DEFAULT 0,
  allocation_q4            REAL    NOT NULL DEFAULT 0,
  description              TEXT,
  invoice_number           TEXT,
  notes                    TEXT,
  highlight_color          TEXT,
  transaction_type         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

-- Idempotent migration: add transaction_type if it doesn't exist yet
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;

-- Default existing rows to BAU
UPDATE transactions SET transaction_type = 'BAU' WHERE transaction_type IS NULL;

-- Year column (replaces due_date for year scoping; derived from global year selector at creation)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS year INTEGER;
UPDATE transactions SET year = EXTRACT(YEAR FROM due_date::date)::int WHERE year IS NULL AND due_date IS NOT NULL;

-- Loss reason (mandatory when stage = LOSS)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS loss_reason TEXT;

-- Audit fields
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS loss_at TIMESTAMPTZ;

-- Activity log
CREATE TABLE IF NOT EXISTS activity_logs (
  id              SERIAL PRIMARY KEY,
  action          TEXT        NOT NULL,
  entity_id       INTEGER,
  performed_by    TEXT        NOT NULL,
  performed_by_role TEXT      NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Odoo user mapping on sellers (for Ventas sync)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS odoo_user_id INTEGER;

-- FX rates synced from Odoo's res.currency.rate.
-- currency stores the Odoo currency name exactly: "USD", "US$", "PES", etc.
-- rate convention (Odoo): 1 ARS = rate [currency]
-- e.g. currency="USD"  rate=0.000909 → 1 ARS = 0.000909 USD
-- e.g. currency="US$"  rate=0.00083  → 1 ARS = 0.00083 US$
CREATE TABLE IF NOT EXISTS fx_rates (
  id         SERIAL PRIMARY KEY,
  rate_date  DATE   NOT NULL,
  currency   TEXT   NOT NULL,  -- Odoo currency name: "USD", "US$", "PES", etc.
  rate       REAL   NOT NULL,  -- 1 ARS = rate [currency]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rate_date, currency)
);

-- Sales imported from Odoo
CREATE TABLE IF NOT EXISTS sales_odoo (
  id                  SERIAL PRIMARY KEY,
  odoo_sale_order_id  INTEGER NOT NULL UNIQUE,
  reference           TEXT,
  client_name         TEXT,
  seller_id           INTEGER REFERENCES sellers(id),
  seller_name_raw     TEXT,
  brand               TEXT,
  invoice_status      TEXT,
  order_state         TEXT,
  sale_date           DATE,
  quarter             TEXT,
  year                INTEGER,
  currency_original   TEXT,
  amount_original     REAL,
  amount_usd_official REAL,
  fx_rate_used        REAL,
  fx_rate_date_used   DATE,
  source              TEXT NOT NULL DEFAULT 'odoo_sales',
  last_sync_at        TIMESTAMPTZ,
  notes               TEXT,
  provider            TEXT,
  internal_tags       TEXT,
  highlight_color     TEXT
);

-- Active/stale tracking for Odoo sales sync. Rows are never deleted; orders not
-- seen in the latest successful sync are hidden from operational Ventas views.
ALTER TABLE sales_odoo ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sales_odoo ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;
