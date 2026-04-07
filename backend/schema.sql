PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS brands (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sellers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  name_normalized TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_name_normalized ON sellers(name_normalized);

CREATE TABLE IF NOT EXISTS plans (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  year     INTEGER NOT NULL,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  q1_plan  REAL,
  q2_plan  REAL,
  q3_plan  REAL,
  q4_plan  REAL,
  UNIQUE(year, brand_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name            TEXT    NOT NULL,
  project_name           TEXT,
  seller_id              INTEGER NOT NULL REFERENCES sellers(id),
  brand_id               INTEGER NOT NULL REFERENCES brands(id),
  sub_brand              TEXT,
  vendor_name            TEXT,
  opportunity_odoo       TEXT,
  brand_opportunity_number TEXT,
  due_date               TEXT,
  stage_label            TEXT    NOT NULL,
  status_label           TEXT,
  tcv                    REAL    NOT NULL,
  allocation_q1          REAL    NOT NULL DEFAULT 0,
  allocation_q2          REAL    NOT NULL DEFAULT 0,
  allocation_q3          REAL    NOT NULL DEFAULT 0,
  allocation_q4          REAL    NOT NULL DEFAULT 0,
  description            TEXT,
  invoice_number         TEXT,
  notes                  TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at             TEXT
);
