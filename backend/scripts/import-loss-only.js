/**
 * import-loss-only.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off import: reads a standalone LOSS sheet from an Excel file and inserts
 * all rows as LOSS transactions (stage_label = 'LOSS', status_label = 'LOSS').
 *
 * Layout expected (matches "Copia de Ultimooo.xlsx"):
 *   col[0]  → client_name
 *   col[1]  → brand_opportunity_number
 *   col[2]  → due_date (ignored if blank)
 *   col[3]  → seller_name
 *   col[4]  → brand_name
 *   col[5]  → sub_brand
 *   col[6]  → vendor_name
 *   col[12] → tcv
 *   col[20] → notes
 *   col[21] → invoice_number
 *
 * Usage:
 *   node scripts/import-loss-only.js /path/to/file.xlsx [--dry-run]
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const XLSX      = require(resolve(__dirname, '../node_modules/xlsx/xlsx.js'));

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const xlsxArg  = args.find(a => !a.startsWith('--'));
const XLSX_PATH = xlsxArg ? resolve(xlsxArg) : null;
const DB_PATH   = resolve(__dirname, '../forecast.db');

if (!XLSX_PATH) {
  console.error('Usage: node scripts/import-loss-only.js /path/to/file.xlsx [--dry-run]');
  process.exit(1);
}

const BRAND_NORMALIZE = {
  'NETWORKING/PRINTERS': 'NETWORKING',
  'AUDIO/VIDEO + DC':    'AUDIO/VIDEO+DC',
  'AUDIO/VIDEO+DC':      'AUDIO/VIDEO+DC',
  'INFRA':               'INFRA',
  'FORTINET':            'FORTINET',
  'MICROINFORMATICA':    'MICROINFORMATICA',
  'NETWORKING':          'NETWORKING',
};

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function normalizeBrand(raw) {
  const s = String(raw || '').trim();
  return BRAND_NORMALIZE[s] ?? null;
}

function upsertBrand(db, name) {
  db.prepare('INSERT OR IGNORE INTO brands (name) VALUES (?)').run(name);
  return db.prepare('SELECT id FROM brands WHERE name = ?').get(name).id;
}

function upsertSeller(db, name) {
  const normalized = String(name || '').trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM sellers WHERE name_normalized = ?').get(normalized);
  if (existing) return existing.id;
  const result = db.prepare('INSERT INTO sellers (name, name_normalized) VALUES (?, ?)').run(name, normalized);
  return result.lastInsertRowid;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' DOT4 Forecast V2 — LOSS-only importer');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` File : ${XLSX_PATH}`);
console.log(` Mode : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
console.log('');

let wb;
try {
  wb = XLSX.readFile(XLSX_PATH);
} catch (e) {
  console.error(`ERROR: Cannot read file: ${e.message}`);
  process.exit(1);
}

// Find the LOSS sheet (case-insensitive)
const sheetName = wb.SheetNames.find(s => s.trim().toUpperCase() === 'LOSS');
if (!sheetName) {
  console.error('ERROR: No sheet named "LOSS" found.');
  console.error('Available sheets:', wb.SheetNames);
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
const dataRows = rows.slice(1); // skip header

const parsed  = [];
const skipped = [];

for (let i = 0; i < dataRows.length; i++) {
  const r      = dataRows[i];
  const rowNum = i + 2; // 1-based, +1 for header

  if (!r || r[0] === null || r[0] === '') continue;

  const client = str(r[0]);
  if (!client) { skipped.push({ row: rowNum, reason: 'Empty client' }); continue; }

  const brand = normalizeBrand(r[4]);
  if (!brand) {
    skipped.push({ row: rowNum, client, reason: `Unknown brand: "${r[4]}"` });
    continue;
  }

  const tcv = toNum(r[12]);
  if (tcv < 0) {
    skipped.push({ row: rowNum, client, reason: `Negative TCV: ${r[12]}` });
    continue;
  }

  parsed.push({
    client_name:              client,
    seller_name:              str(r[3]) || 'Unknown',
    brand_name:               brand,
    sub_brand:                str(r[5]),
    vendor_name:              str(r[6]),
    brand_opportunity_number: str(r[1]),
    due_date:                 str(r[2]),
    stage_label:              'LOSS',
    status_label:             'LOSS',
    tcv,
    allocation_q1:            0,
    allocation_q2:            0,
    allocation_q3:            0,
    allocation_q4:            0,
    notes:                    str(r[20]),
    invoice_number:           str(r[21]),
  });
}

console.log(`Parsed : ${parsed.length} rows`);
console.log(`Skipped: ${skipped.length} rows`);

if (skipped.length) {
  skipped.forEach(s => console.log(`  [row ${s.row}] ${s.client || ''}: ${s.reason}`));
}

if (DRY_RUN) {
  console.log('\n── Preview (all rows):');
  parsed.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.client_name} | ${t.brand_name} | TCV=${t.tcv.toLocaleString()} | seller=${t.seller_name}`);
  });
  console.log('\n[DRY RUN] Nothing written. Remove --dry-run to import.');
  process.exit(0);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const insertTx = db.prepare(`
  INSERT INTO transactions (
    client_name, project_name, seller_id, brand_id,
    sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
    due_date, stage_label, status_label, tcv,
    allocation_q1, allocation_q2, allocation_q3, allocation_q4,
    notes, invoice_number
  ) VALUES (
    @client_name, NULL, @seller_id, @brand_id,
    @sub_brand, @vendor_name, NULL, @brand_opportunity_number,
    @due_date, @stage_label, @status_label, @tcv,
    @allocation_q1, @allocation_q2, @allocation_q3, @allocation_q4,
    @notes, @invoice_number
  )
`);

const run = db.transaction(() => {
  let count = 0;
  for (const tx of parsed) {
    const seller_id = upsertSeller(db, tx.seller_name);
    const brand_id  = upsertBrand(db, tx.brand_name);
    insertTx.run({ ...tx, seller_id, brand_id });
    count++;
  }
  return count;
});

const imported = run();

const total = db.prepare('SELECT COUNT(*) as n FROM transactions WHERE deleted_at IS NULL').get().n;
const loss  = db.prepare("SELECT COUNT(*) as n FROM transactions WHERE status_label = 'LOSS' AND deleted_at IS NULL").get().n;

console.log(`\nImported : ${imported} LOSS transactions`);
console.log(`DB total : ${total} transactions (${loss} LOSS)`);
console.log('\nDone.');
db.close();
