/**
 * import-datadot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports plans and transactions from DATADOT.xlsx (sheet "PLAN 2026" + "LOSS")
 * into the forecast-v2 SQLite database.
 *
 * Usage:
 *   node scripts/import-datadot.js [path/to/DATADOT.xlsx] [--dry-run] [--clear]
 *
 * Options:
 *   path      Path to Excel file. Defaults to ./DATADOT.xlsx
 *   --dry-run Print what would be imported without writing to DB
 *   --clear   Delete all existing plans + transactions before import
 *
 * MAPPING ASSUMPTIONS
 * ───────────────────
 * Plans (rows 2–6 of sheet, 0-indexed):
 *   col[0]  → brand name (needs normalization)
 *   col[6]  → q1_plan
 *   col[7]  → q2_plan
 *   col[8]  → q3_plan
 *   col[9]  → q4_plan
 *   year    = 2026 (hardcoded)
 *
 * Transactions (rows 21+ of "PLAN 2026", plus all of "LOSS" sheet):
 *   col[0]  → client_name ("Cliente - Proyecto", not split)
 *   col[1]  → quarter (used to derive due_date; not stored)
 *   col[2]  → opportunity_odoo
 *   col[3]  → brand_opportunity_number
 *   col[5]  → seller_name (created on demand)
 *   col[6]  → brand_name (created on demand)
 *   col[7]  → sub_brand
 *   col[8]  → vendor_name (Marca)
 *   col[9]  → status (LOSS detection)
 *   col[13] → odd  → stage_label
 *   col[14] → tcv
 *   col[15] → q1_weighted_value
 *   col[16] → q2_weighted_value
 *   col[17] → q3_weighted_value
 *   col[18] → q4_weighted_value
 *   col[22] → notes (Descripcion)
 *   col[23] → invoice_number
 *
 * LOSS sheet uses different layout (no Quarter column):
 *   col[0]  → client_name
 *   col[3]  → seller_name
 *   col[4]  → brand_name
 *   col[5]  → sub_brand
 *   col[6]  → vendor_name
 *   col[7]  → status (always "LOSS")
 *   col[11] → odd (always 0 for LOSS — defaulted to Identified)
 *   col[12] → tcv
 *   col[20] → notes
 *
 * Brand normalization:
 *   "NETWORKING/PRINTERS"  → "NETWORKING"
 *   "AUDIO/VIDEO + DC"     → "AUDIO/VIDEO+DC"
 *   All others kept as-is (INFRA, FORTINET, MICROINFORMATICA)
 *
 * Odd → stage_label:
 *   0.10 → Identified
 *   0.25 → Proposal 25
 *   0.50 → Proposal 50
 *   0.75 → Proposal 75
 *   1.00 → Won
 *   other → skip (logged)
 *
 * Quarter → due_date (derived, not stored in Excel):
 *   1Q → 2026-03-31
 *   2Q → 2026-06-30
 *   3Q → 2026-09-30
 *   4Q → 2026-12-31
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const XLSX      = require(resolve(__dirname, '../node_modules/xlsx/xlsx.js'));

// ─── Config ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAR   = args.includes('--clear');
const xlsxArg = args.find(a => !a.startsWith('--'));
const XLSX_PATH  = xlsxArg ? resolve(xlsxArg) : resolve(__dirname, '../DATADOT.xlsx');
const DB_PATH    = resolve(__dirname, '../forecast.db');
const YEAR       = 2026;

// ─── Constants ───────────────────────────────────────────────────────────────

const ODD_TO_STAGE = {
  0.10: 'Identified',
  0.25: 'Proposal 25',
  0.50: 'Proposal 50',
  0.75: 'Proposal 75',
  1.00: 'Won',
};

// Canonical app brand names
const BRAND_NORMALIZE = {
  'NETWORKING/PRINTERS': 'NETWORKING',
  'AUDIO/VIDEO + DC':    'AUDIO/VIDEO+DC',
  'AUDIO/VIDEO+DC':      'AUDIO/VIDEO+DC',
  'INFRA':               'INFRA',
  'FORTINET':            'FORTINET',
  'MICROINFORMATICA':    'MICROINFORMATICA',
  'NETWORKING':          'NETWORKING',
};

// Plan sheet: brand name in col[0] maps to normalized name
const PLAN_BRAND_MAP = {
  'INFRA':               'INFRA',
  'NETWORKING/PRINTERS': 'NETWORKING',
  'AUDIO/VIDEO + DC':    'AUDIO/VIDEO+DC',
  'FORTINET':            'FORTINET',
  'MICROINFORMATICA':    'MICROINFORMATICA',
};

const QUARTER_DATE = {
  '1Q': '2026-03-31',
  '2Q': '2026-06-30',
  '3Q': '2026-09-30',
  '4Q': '2026-12-31',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeBrand(raw) {
  const s = String(raw || '').trim();
  return BRAND_NORMALIZE[s] ?? null;
}

function oddToStage(odd) {
  // Round to 2 decimal places to avoid float comparison issues
  const rounded = Math.round(odd * 100) / 100;
  return ODD_TO_STAGE[rounded] ?? null;
}

function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// ─── Parse plans ─────────────────────────────────────────────────────────────

function parsePlans(rows) {
  const plans = [];
  // Plan rows are 2–6 (0-indexed), stop at "Total 2026"
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const label = String(r[0]).trim();
    if (label.toLowerCase().startsWith('total')) break;
    const brand = PLAN_BRAND_MAP[label];
    if (!brand) continue;
    plans.push({
      brand,
      q1_plan: toNum(r[6]),
      q2_plan: toNum(r[7]),
      q3_plan: toNum(r[8]),
      q4_plan: toNum(r[9]),
    });
  }
  return plans;
}

// ─── Parse transactions from PLAN 2026 ───────────────────────────────────────

function parsePlanTransactions(rows) {
  const results  = [];
  const skipped  = [];

  // Transaction rows start at index 21 (0-indexed)
  const dataRows = rows.slice(21);

  for (let ri = 0; ri < dataRows.length; ri++) {
    const r = dataRows[ri];
    if (!r || r[0] === null || r[0] === '') continue;

    const rowNum    = ri + 22; // 1-based Excel row
    const clientRaw = str(r[0]);
    if (!clientRaw) { skipped.push({ row: rowNum, reason: 'Empty client name', raw: r[0] }); continue; }

    const brandRaw = normalizeBrand(r[6]);
    if (!brandRaw) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `Unknown brand: "${r[6]}"` });
      continue;
    }

    const odd = toNum(r[13]);
    const stage_label = oddToStage(odd);
    if (!stage_label) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `Unsupported odd value: ${r[13]}` });
      continue;
    }

    const tcv = toNum(r[14]);
    if (tcv <= 0) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `Invalid TCV: ${r[14]}` });
      continue;
    }

    // Quarter values (already weighted in the Excel)
    const q1w = toNum(r[15]);
    const q2w = toNum(r[16]);
    const q3w = toNum(r[17]);
    const q4w = toNum(r[18]);
    const weighted_total = q1w + q2w + q3w + q4w;

    if (weighted_total <= 0) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `weighted_total = 0 (all quarter values empty)` });
      continue;
    }

    // Validate: weighted_total should ≈ TCV × odd (allow 1% tolerance)
    const expected = tcv * odd;
    if (expected > 0 && Math.abs(weighted_total - expected) / expected > 0.01) {
      // Log but do not skip — use actual values from Excel
      console.warn(`  [WARN] Row ${rowNum} "${clientRaw}": weighted_total ${weighted_total.toFixed(0)} ≠ TCV×odd ${expected.toFixed(0)} (diff: ${((Math.abs(weighted_total - expected) / expected) * 100).toFixed(1)}%)`);
    }

    const allocation_q1 = q1w / weighted_total;
    const allocation_q2 = q2w / weighted_total;
    const allocation_q3 = q3w / weighted_total;
    const allocation_q4 = q4w / weighted_total;

    // Allocation sum should be 1 (sanity check)
    const allocSum = allocation_q1 + allocation_q2 + allocation_q3 + allocation_q4;
    if (Math.abs(allocSum - 1.0) > 0.001) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `Allocation sum = ${allocSum.toFixed(4)}, not 1` });
      continue;
    }

    const statusRaw = str(r[9]);
    const status_label = statusRaw === 'LOSS' ? 'LOSS' : null;

    const quarterRaw = str(r[1]);
    const due_date   = QUARTER_DATE[quarterRaw] ?? null;

    results.push({
      client_name:              clientRaw,
      project_name:             null,
      seller_name:              str(r[5]) || 'Unknown',
      brand_name:               brandRaw,
      sub_brand:                str(r[7]),
      vendor_name:              str(r[8]),
      opportunity_odoo:         str(r[2]),
      brand_opportunity_number: str(r[3]),
      due_date,
      stage_label,
      status_label,
      tcv,
      allocation_q1,
      allocation_q2,
      allocation_q3,
      allocation_q4,
      notes:                    str(r[22]),
      invoice_number:           str(r[23]),
    });
  }

  return { results, skipped };
}

// ─── Parse LOSS sheet transactions ───────────────────────────────────────────
//
// The LOSS sheet has two different layouts:
//
// Layout A (rows 1–9): no Quarter column
//   [0] client  [1] Nro oportunidad  [2] Fecha  [3] seller  [4] brand
//   [5] sub_brand  [6] vendor  [7] Status  [8] Tipo  [9] Operacion
//   [10] Mayorista  [11] odd  [12] TCV  ... [20] notes  [21] invoice
//
// Layout B (rows 10–14): Quarter inserted at [1], everything else shifted +1
//   [0] client  [1] Quarter  [2] Fecha  [3] Nro oportunidad  [4] seller
//   [5] brand  [6] sub_brand  [7] vendor  [8] Status  [9] Tipo
//   [10] Operacion  [11] Mayorista  [12] odd  [13] TCV  ... [21] notes  [22] invoice
//
// Detection: if r[1] is a quarter string ("1Q","2Q","3Q","4Q") → Layout B

const QUARTER_STRINGS = new Set(['1Q', '2Q', '3Q', '4Q']);

function parseLossTransactions(rows) {
  const results = [];
  const skipped = [];

  // Row 0 is header, data starts at row 1
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (!r || r[0] === null || r[0] === '') continue;

    const rowNum    = ri + 1;
    const clientRaw = str(r[0]);
    if (!clientRaw) { skipped.push({ sheet: 'LOSS', row: rowNum, reason: 'Empty client name' }); continue; }

    // Detect layout
    const layoutB = QUARTER_STRINGS.has(str(r[1]));
    const shift   = layoutB ? 1 : 0;

    const sellerCol   = 3 + shift;
    const brandCol    = 4 + shift;
    const subBrandCol = 5 + shift;
    const vendorCol   = 6 + shift;
    const tcvCol      = 12 + shift;
    const notesCol    = 20 + shift;
    const invoiceCol  = 21 + shift;
    const nroOpCol    = layoutB ? 3 : 1;  // Layout B: [3], Layout A: [1]

    const brandRaw = normalizeBrand(r[brandCol]);
    if (!brandRaw) {
      skipped.push({ sheet: 'LOSS', row: rowNum, client: clientRaw, reason: `Unknown brand: "${r[brandCol]}"` });
      continue;
    }

    const tcv = toNum(r[tcvCol]);
    if (tcv < 0) {
      skipped.push({ sheet: 'LOSS', row: rowNum, client: clientRaw, reason: `Invalid TCV: ${r[tcvCol]}` });
      continue;
    }

    // LOSS rows have odd=0 — use Identified as default stage_label
    // (stage_label is required by schema; LOSS rows are excluded from forecast calcs)
    const stage_label  = 'Identified';
    const status_label = 'LOSS';

    // Derive due_date from Quarter if layout B has it
    const quarterRaw = layoutB ? str(r[1]) : null;
    const due_date   = QUARTER_DATE[quarterRaw] ?? null;

    results.push({
      client_name:              clientRaw,
      project_name:             null,
      seller_name:              str(r[sellerCol]) || 'Unknown',
      brand_name:               brandRaw,
      sub_brand:                str(r[subBrandCol]),
      vendor_name:              str(r[vendorCol]),
      opportunity_odoo:         null,
      brand_opportunity_number: str(r[nroOpCol]),
      due_date,
      stage_label,
      status_label,
      tcv,
      allocation_q1:            0,
      allocation_q2:            0,
      allocation_q3:            0,
      allocation_q4:            0,
      notes:                    str(r[notesCol]),
      invoice_number:           str(r[invoiceCol]),
    });
  }

  return { results, skipped };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function upsertBrand(db, name) {
  db.prepare('INSERT OR IGNORE INTO brands (name) VALUES (?)').run(name);
  return db.prepare('SELECT id FROM brands WHERE name = ?').get(name).id;
}

function normalizeSeller(name) {
  return String(name || '').trim().toLowerCase();
}

function upsertSeller(db, name) {
  const normalized = normalizeSeller(name);
  const existing = db.prepare('SELECT id FROM sellers WHERE name_normalized = ?').get(normalized);
  if (existing) return existing.id;
  const result = db.prepare('INSERT INTO sellers (name, name_normalized) VALUES (?, ?)').run(name, normalized);
  return result.lastInsertRowid;
}

function mergeDuplicateSellers(db) {
  const groups = db.prepare(`
    SELECT name_normalized, MIN(id) AS keep_id
    FROM sellers
    GROUP BY name_normalized
    HAVING COUNT(*) > 1
  `).all();

  for (const g of groups) {
    const losers = db.prepare(
      'SELECT id FROM sellers WHERE name_normalized = ? AND id != ?'
    ).all(g.name_normalized, g.keep_id);

    for (const loser of losers) {
      db.prepare('UPDATE transactions SET seller_id = ? WHERE seller_id = ?').run(g.keep_id, loser.id);
      db.prepare('DELETE FROM sellers WHERE id = ?').run(loser.id);
    }
  }

  return groups.length;
}

function ensureSellerNormalized(db) {
  const cols = db.prepare('PRAGMA table_info(sellers)').all();
  const hasNormalized = cols.some(c => c.name === 'name_normalized');

  if (!hasNormalized) {
    db.exec('ALTER TABLE sellers ADD COLUMN name_normalized TEXT');
    db.prepare('UPDATE sellers SET name_normalized = lower(trim(name))').run();
    const merged = mergeDuplicateSellers(db);
    if (merged > 0) {
      console.log(`  [migration] Merged ${merged} duplicate seller group(s).`);
    }
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_name_normalized ON sellers(name_normalized)');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' DOT4 Forecast V2 — Excel Importer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` File  : ${XLSX_PATH}`);
  console.log(` DB    : ${DB_PATH}`);
  console.log(` Year  : ${YEAR}`);
  console.log(` Mode  : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (CLEAR) console.log(' Clear : Will delete existing plans + transactions first');
  console.log('');

  // ── Read Excel ──
  let wb;
  try {
    wb = XLSX.readFile(XLSX_PATH);
  } catch (e) {
    console.error(`ERROR: Cannot read file: ${e.message}`);
    process.exit(1);
  }

  if (!wb.SheetNames.includes('PLAN 2026')) {
    console.error('ERROR: Sheet "PLAN 2026" not found in workbook.');
    console.error('Available sheets:', wb.SheetNames);
    process.exit(1);
  }

  const planRows = XLSX.utils.sheet_to_json(wb.Sheets['PLAN 2026'], { header: 1, defval: null });
  const lossRows = wb.Sheets['LOSS']
    ? XLSX.utils.sheet_to_json(wb.Sheets['LOSS'], { header: 1, defval: null })
    : [];

  // ── Parse ──
  const plans = parsePlans(planRows);
  console.log(`Plans parsed: ${plans.length}`);
  plans.forEach(p => console.log(`  ${p.brand}: Q1=${p.q1_plan.toLocaleString()} Q2=${p.q2_plan.toLocaleString()} Q3=${p.q3_plan.toLocaleString()} Q4=${p.q4_plan.toLocaleString()}`));

  const { results: txMain, skipped: skipMain } = parsePlanTransactions(planRows);
  const { results: txLoss, skipped: skipLoss  } = parseLossTransactions(lossRows);
  const allTx      = [...txMain, ...txLoss];
  const allSkipped = [...skipMain, ...skipLoss];

  console.log(`\nTransactions parsed: ${allTx.length} (${txMain.length} active + ${txLoss.length} LOSS)`);
  console.log(`Skipped rows: ${allSkipped.length}`);
  if (allSkipped.length) {
    console.log('\n── Skipped rows:');
    allSkipped.forEach(s => {
      const where = s.sheet ? `[${s.sheet} row ${s.row}]` : `[row ${s.row}]`;
      const who   = s.client ? ` "${s.client}"` : '';
      console.log(`  ${where}${who}: ${s.reason}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes written. Remove --dry-run to import.');
    console.log('\n── Sample transactions (first 5):');
    allTx.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.client_name} | ${t.brand_name} | ${t.stage_label} | TCV=${t.tcv} | seller=${t.seller_name}`);
    });
    return;
  }

  // ── Open DB ──
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Ensure name_normalized column exists and duplicates are merged
  ensureSellerNormalized(db);

  // ── Optionally clear ──
  if (CLEAR) {
    console.log('\nClearing existing data...');
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM plans').run();
    console.log('  Existing transactions and plans deleted.');
  }

  // ── Import plans ──
  console.log('\nImporting plans...');
  const insertPlan = db.prepare(`
    INSERT INTO plans (year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan)
    VALUES (@year, @brand_id, @q1_plan, @q2_plan, @q3_plan, @q4_plan)
    ON CONFLICT(year, brand_id) DO UPDATE SET
      q1_plan = excluded.q1_plan,
      q2_plan = excluded.q2_plan,
      q3_plan = excluded.q3_plan,
      q4_plan = excluded.q4_plan
  `);

  let plansImported = 0;
  for (const p of plans) {
    const brand_id = upsertBrand(db, p.brand);
    insertPlan.run({ year: YEAR, brand_id, q1_plan: p.q1_plan, q2_plan: p.q2_plan, q3_plan: p.q3_plan, q4_plan: p.q4_plan });
    console.log(`  ✓ ${p.brand}: Q1=${p.q1_plan.toLocaleString()} Q2=${p.q2_plan.toLocaleString()} Q3=${p.q3_plan.toLocaleString()} Q4=${p.q4_plan.toLocaleString()}`);
    plansImported++;
  }

  // ── Import transactions ──
  console.log(`\nImporting ${allTx.length} transactions...`);
  const insertTx = db.prepare(`
    INSERT INTO transactions (
      client_name, project_name, seller_id, brand_id,
      sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
      due_date, stage_label, status_label, tcv,
      allocation_q1, allocation_q2, allocation_q3, allocation_q4,
      notes, invoice_number
    ) VALUES (
      @client_name, @project_name, @seller_id, @brand_id,
      @sub_brand, @vendor_name, @opportunity_odoo, @brand_opportunity_number,
      @due_date, @stage_label, @status_label, @tcv,
      @allocation_q1, @allocation_q2, @allocation_q3, @allocation_q4,
      @notes, @invoice_number
    )
  `);

  const importAllTx = db.transaction((txList) => {
    let count = 0;
    const txErrors = [];
    for (const tx of txList) {
      try {
        const seller_id = upsertSeller(db, tx.seller_name);
        const brand_id  = upsertBrand(db, tx.brand_name);
        insertTx.run({
          client_name:              tx.client_name,
          project_name:             tx.project_name,
          seller_id,
          brand_id,
          sub_brand:                tx.sub_brand,
          vendor_name:              tx.vendor_name,
          opportunity_odoo:         tx.opportunity_odoo,
          brand_opportunity_number: tx.brand_opportunity_number,
          due_date:                 tx.due_date,
          stage_label:              tx.stage_label,
          status_label:             tx.status_label,
          tcv:                      tx.tcv,
          allocation_q1:            tx.allocation_q1,
          allocation_q2:            tx.allocation_q2,
          allocation_q3:            tx.allocation_q3,
          allocation_q4:            tx.allocation_q4,
          notes:                    tx.notes,
          invoice_number:           tx.invoice_number,
        });
        count++;
      } catch (e) {
        txErrors.push({ client: tx.client_name, error: e.message });
      }
    }
    return { count, txErrors };
  });

  const { count: txImported, txErrors } = importAllTx(allTx);

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Import Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Plans imported          : ${plansImported}`);
  console.log(` Transactions imported   : ${txImported}`);
  console.log(` Transactions skipped    : ${allSkipped.length}`);
  if (txErrors.length) {
    console.log(` Transactions errored    : ${txErrors.length}`);
    txErrors.forEach(e => console.log(`  ✗ "${e.client}": ${e.error}`));
  }
  console.log('');

  if (allSkipped.length) {
    console.log('── Skipped row details:');
    allSkipped.forEach(s => {
      const where = s.sheet ? `[${s.sheet} row ${s.row}]` : `[row ${s.row}]`;
      const who   = s.client ? ` "${s.client}"` : '';
      console.log(`  ${where}${who}: ${s.reason}`);
    });
    console.log('');
  }

  // Quick DB verification
  const txCount   = db.prepare('SELECT COUNT(*) as n FROM transactions WHERE deleted_at IS NULL').get().n;
  const planCount = db.prepare('SELECT COUNT(*) as n FROM plans').get().n;
  const brandCount = db.prepare('SELECT COUNT(*) as n FROM brands').get().n;
  const sellerCount = db.prepare('SELECT COUNT(*) as n FROM sellers').get().n;

  console.log('── DB state after import:');
  console.log(`  transactions : ${txCount}`);
  console.log(`  plans        : ${planCount}`);
  console.log(`  brands       : ${brandCount}`);
  console.log(`  sellers      : ${sellerCount}`);
  console.log('');
  console.log('Done.');

  db.close();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
