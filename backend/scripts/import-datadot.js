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
 *   col[1]  → quarter (Q1/Q2/Q3/Q4/1Q-4Q — stored as allocations)
 *   col[2]  → opportunity_odoo
 *   col[3]  → brand_opportunity_number
 *   col[5]  → seller_name (created on demand)
 *   col[6]  → brand_name (created on demand)
 *   col[7]  → sub_brand
 *   col[8]  → vendor_name (Marca)
 *   col[9]  → status (LOSS detection)
 *   col[13] → odd → stage_label
 *   col[14] → tcv
 *   col[22] → notes (Descripcion)
 *   col[23] → invoice_number
 *
 * NOTE: Columns col[15]–col[18] (Excel weighted quarter values) are IGNORED.
 * weighted_total is always computed as TCV × stage_probability.
 *
 * Quarter mapping:
 *   Q1    → allocation_q1=1, others=0
 *   Q2    → allocation_q2=1, others=0
 *   Q3    → allocation_q3=1, others=0
 *   Q4    → allocation_q4=1, others=0
 *   1Q-4Q → allocation_q1=0.25, allocation_q2=0.25, allocation_q3=0.25, allocation_q4=0.25
 *
 * Quarter → due_date (end of quarter):
 *   Q1 / 1Q → 2026-03-31
 *   Q2 / 2Q → 2026-06-30
 *   Q3 / 3Q → 2026-09-30
 *   Q4 / 4Q → 2026-12-31
 *   1Q-4Q   → 2026-12-31 (end of year)
 *
 * LOSS sheet uses different layout (no Quarter column):
 *   col[0]  → client_name
 *   col[3]  → seller_name
 *   col[4]  → brand_name
 *   col[5]  → sub_brand
 *   col[6]  → vendor_name
 *   col[7]  → status (always "LOSS")
 *   col[12] → tcv
 *   col[20] → notes
 *
 * LOSS sheet layout B (quarter inserted at col[1], everything else shifted +1):
 *   Detection: if r[1] is a quarter string → Layout B
 *
 * Odd → stage_label:
 *   0.10 → Identified
 *   0.25 → Proposal 25
 *   0.50 → Proposal 50
 *   0.75 → Proposal 75
 *   1.00 → Won
 *
 * Brand normalization:
 *   "NETWORKING/PRINTERS"  → "NETWORKING"
 *   "AUDIO/VIDEO + DC"     → "AUDIO/VIDEO+DC"
 *   All others kept as-is (INFRA, FORTINET, MICROINFORMATICA)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const XLSX      = require(resolve(__dirname, '../node_modules/xlsx/xlsx.js'));

// ─── Config ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAR   = args.includes('--clear');
const xlsxArg = args.find(a => !a.startsWith('--'));
const XLSX_PATH = xlsxArg ? resolve(xlsxArg) : resolve(__dirname, '../DATADOT.xlsx');
const YEAR      = 2026;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('  Example: DATABASE_URL=postgresql://... node scripts/import-datadot.js');
  process.exit(1);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_MAP = {
  'Identified':   0.10,
  'Proposal 25':  0.25,
  'Proposal 50':  0.50,
  'Proposal 75':  0.75,
  'Won':          1.00,
};

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

/**
 * Maps a quarter label to end-of-quarter due_date.
 * Accepts both new format (Q1-Q4, 1Q-4Q) and old format (1Q-4Q) from Excel.
 */
function quarterToDueDate(quarter) {
  switch (quarter) {
    case 'Q1': case '1Q': return `${YEAR}-03-31`;
    case 'Q2': case '2Q': return `${YEAR}-06-30`;
    case 'Q3': case '3Q': return `${YEAR}-09-30`;
    case 'Q4': case '4Q': return `${YEAR}-12-31`;
    case '1Q-4Q':         return `${YEAR}-12-31`;
    default:              return null;
  }
}

/**
 * Maps a quarter label to allocation values.
 * Returns { allocation_q1, allocation_q2, allocation_q3, allocation_q4 } or null.
 */
function quarterToAllocations(quarter) {
  switch (quarter) {
    case 'Q1': case '1Q': return { allocation_q1: 1,    allocation_q2: 0,    allocation_q3: 0,    allocation_q4: 0    };
    case 'Q2': case '2Q': return { allocation_q1: 0,    allocation_q2: 1,    allocation_q3: 0,    allocation_q4: 0    };
    case 'Q3': case '3Q': return { allocation_q1: 0,    allocation_q2: 0,    allocation_q3: 1,    allocation_q4: 0    };
    case 'Q4': case '4Q': return { allocation_q1: 0,    allocation_q2: 0,    allocation_q3: 0,    allocation_q4: 1    };
    case '1Q-4Q':         return { allocation_q1: 0.25, allocation_q2: 0.25, allocation_q3: 0.25, allocation_q4: 0.25 };
    default:              return null;
  }
}

// Quarter strings recognized in Excel cells (both old and new formats)
const QUARTER_STRINGS = new Set(['1Q', '2Q', '3Q', '4Q', 'Q1', 'Q2', 'Q3', 'Q4', '1Q-4Q']);

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

    // Detect LOSS rows from status column
    const statusRaw   = str(r[9]);
    const isLossRow   = statusRaw === 'LOSS';
    const status_label = isLossRow ? 'LOSS' : null;

    // LOSS rows in the plan sheet use relaxed validation
    if (isLossRow) {
      const brandRaw = normalizeBrand(r[6]);
      if (!brandRaw) {
        skipped.push({ row: rowNum, client: clientRaw, reason: `Unknown brand: "${r[6]}"` });
        continue;
      }

      const tcv = toNum(r[14]);
      // For LOSS: negative TCV is invalid, zero/missing is allowed
      if (tcv < 0) {
        skipped.push({ row: rowNum, client: clientRaw, reason: `Invalid TCV: ${r[14]}` });
        continue;
      }

      const quarterRaw = str(r[1]);
      const due_date   = quarterToDueDate(quarterRaw);

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
        stage_label:              'Identified',
        status_label:             'LOSS',
        tcv,
        allocation_q1:            0,
        allocation_q2:            0,
        allocation_q3:            0,
        allocation_q4:            0,
        notes:                    str(r[22]),
        invoice_number:           str(r[23]),
      });
      continue;
    }

    // Active deal: strict validation
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

    // Compute weighted_total from TCV × stage probability (do NOT trust Excel columns)
    const stage_prob     = STAGE_MAP[stage_label];
    const weighted_total = tcv * stage_prob;

    // Resolve quarter from col[1]
    const quarterRaw = str(r[1]);
    if (!quarterRaw || !QUARTER_STRINGS.has(quarterRaw)) {
      skipped.push({ row: rowNum, client: clientRaw, reason: `Unrecognized quarter value: "${r[1]}"` });
      continue;
    }

    const alloc    = quarterToAllocations(quarterRaw);
    const due_date = quarterToDueDate(quarterRaw);

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
      status_label:             null,
      tcv,
      allocation_q1:            alloc.allocation_q1,
      allocation_q2:            alloc.allocation_q2,
      allocation_q3:            alloc.allocation_q3,
      allocation_q4:            alloc.allocation_q4,
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
// Detection: if r[1] is a quarter string → Layout B

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
    // LOSS: negative TCV is invalid, zero/missing is allowed
    if (tcv < 0) {
      skipped.push({ sheet: 'LOSS', row: rowNum, client: clientRaw, reason: `Invalid TCV: ${r[tcvCol]}` });
      continue;
    }

    // LOSS rows always get stage_label = Identified (excluded from forecast calcs)
    const stage_label  = 'Identified';
    const status_label = 'LOSS';

    // Derive due_date from Quarter if layout B has it
    const quarterRaw = layoutB ? str(r[1]) : null;
    const due_date   = quarterRaw ? quarterToDueDate(quarterRaw) : null;

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

function normalizeSeller(name) {
  return String(name || '').trim().toLowerCase();
}

async function upsertBrand(pool, name) {
  await pool.query(
    'INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [name]
  );
  const { rows } = await pool.query('SELECT id FROM brands WHERE name = $1', [name]);
  return rows[0].id;
}

async function upsertSeller(pool, name) {
  const normalized = normalizeSeller(name);
  const { rows: existing } = await pool.query(
    'SELECT id FROM sellers WHERE name_normalized = $1', [normalized]
  );
  if (existing[0]) return existing[0].id;
  const { rows } = await pool.query(
    'INSERT INTO sellers (name, name_normalized) VALUES ($1, $2) RETURNING id',
    [name, normalized]
  );
  return rows[0].id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' DOT4 Forecast V2 — Excel Importer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` File  : ${XLSX_PATH}`);
  console.log(` DB    : ${process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@')}`);
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

  // Count active vs LOSS
  const activeTx = allTx.filter(t => t.status_label !== 'LOSS');
  const lossTx   = allTx.filter(t => t.status_label === 'LOSS');

  console.log(`\nTransactions parsed: ${allTx.length} (${activeTx.length} active + ${lossTx.length} LOSS)`);
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
      const wt = t.tcv * (STAGE_MAP[t.stage_label] ?? 0);
      console.log(`  ${i + 1}. ${t.client_name} | ${t.brand_name} | ${t.stage_label} | TCV=${t.tcv} | weighted=${wt.toFixed(0)} | alloc=[${t.allocation_q1},${t.allocation_q2},${t.allocation_q3},${t.allocation_q4}] | seller=${t.seller_name}`);
    });
    return;
  }

  // ── Connect to PostgreSQL ──
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();

  try {
    // ── Optionally clear ──
    if (CLEAR) {
      console.log('\nClearing existing data...');
      await client.query('DELETE FROM transactions');
      await client.query('DELETE FROM plans');
      console.log('  Existing transactions and plans deleted.');
    }

    // ── Import plans ──
    console.log('\nImporting plans...');
    let plansImported = 0;
    for (const p of plans) {
      const brand_id = await upsertBrand(pool, p.brand);
      await pool.query(`
        INSERT INTO plans (year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (year, brand_id) DO UPDATE SET
          q1_plan = EXCLUDED.q1_plan,
          q2_plan = EXCLUDED.q2_plan,
          q3_plan = EXCLUDED.q3_plan,
          q4_plan = EXCLUDED.q4_plan
      `, [YEAR, brand_id, p.q1_plan, p.q2_plan, p.q3_plan, p.q4_plan]);
      console.log(`  + ${p.brand}: Q1=${p.q1_plan.toLocaleString()} Q2=${p.q2_plan.toLocaleString()} Q3=${p.q3_plan.toLocaleString()} Q4=${p.q4_plan.toLocaleString()}`);
      plansImported++;
    }

    // ── Import transactions ──
    console.log(`\nImporting ${allTx.length} transactions...`);
    let txImported = 0;
    const txErrors = [];

    await client.query('BEGIN');
    for (const tx of allTx) {
      try {
        const seller_id = await upsertSeller(pool, tx.seller_name);
        const brand_id  = await upsertBrand(pool, tx.brand_name);
        await pool.query(`
          INSERT INTO transactions (
            client_name, project_name, seller_id, brand_id,
            sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
            due_date, stage_label, status_label, tcv,
            allocation_q1, allocation_q2, allocation_q3, allocation_q4,
            notes, invoice_number
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18
          )
        `, [
          tx.client_name, tx.project_name, seller_id, brand_id,
          tx.sub_brand, tx.vendor_name, tx.opportunity_odoo, tx.brand_opportunity_number,
          tx.due_date, tx.stage_label, tx.status_label, tx.tcv,
          tx.allocation_q1, tx.allocation_q2, tx.allocation_q3, tx.allocation_q4,
          tx.notes, tx.invoice_number,
        ]);
        txImported++;
      } catch (e) {
        txErrors.push({ client: tx.client_name, error: e.message });
      }
    }
    await client.query('COMMIT');

    // ─── Summary ────────────────────────────────────────────────────────────

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Import Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(` Plans imported          : ${plansImported}`);
    console.log(` Transactions imported   : ${txImported}`);
    console.log(` Transactions skipped    : ${allSkipped.length}`);
    if (txErrors.length) {
      console.log(` Transactions errored    : ${txErrors.length}`);
      txErrors.forEach(e => console.log(`  x "${e.client}": ${e.error}`));
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
    const { rows: counts } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS tx,
        (SELECT COUNT(*) FROM plans) AS plans,
        (SELECT COUNT(*) FROM brands) AS brands,
        (SELECT COUNT(*) FROM sellers) AS sellers
    `);
    console.log('── DB state after import:');
    console.log(`  transactions : ${counts[0].tx}`);
    console.log(`  plans        : ${counts[0].plans}`);
    console.log(`  brands       : ${counts[0].brands}`);
    console.log(`  sellers      : ${counts[0].sellers}`);
    console.log('');
    console.log('Done.');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
