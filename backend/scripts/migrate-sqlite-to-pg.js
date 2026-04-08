/**
 * migrate-sqlite-to-pg.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: copies all data from forecast.db (SQLite) into Railway
 * PostgreSQL, preserving all manually created transactions.
 *
 * Requirements:
 *   - better-sqlite3 installed (npm install --include=dev)
 *   - DATABASE_URL set to the Railway PostgreSQL connection string
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-pg.js [path/to/forecast.db]
 *
 * Options:
 *   --dry-run   Show what would be migrated without writing
 *   --clear     Delete all existing data in PostgreSQL before migrating
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';

const { Pool }  = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const Database  = require('better-sqlite3');

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const CLEAR    = args.includes('--clear');
const dbArg    = args.find(a => !a.startsWith('--'));
const DB_PATH  = dbArg ? resolve(dbArg) : resolve(__dirname, '../forecast.db');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' DOT4 Forecast V2 — SQLite → PostgreSQL Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Source : ${DB_PATH}`);
  console.log(` Target : ${process.env.DATABASE_URL.replace(/:\/\/.*@/, '://***@')}`);
  console.log(` Mode   : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (CLEAR) console.log(' Clear  : Will delete existing data in PostgreSQL first');
  console.log('');

  // ── Read from SQLite ──
  let sqlite;
  try {
    sqlite = new Database(DB_PATH, { readonly: true });
  } catch (e) {
    console.error(`ERROR: Cannot open SQLite file: ${e.message}`);
    process.exit(1);
  }

  const brands   = sqlite.prepare('SELECT * FROM brands ORDER BY id').all();
  const sellers  = sqlite.prepare('SELECT * FROM sellers ORDER BY id').all();
  const plans    = sqlite.prepare('SELECT * FROM plans ORDER BY id').all();
  const txRows   = sqlite.prepare('SELECT * FROM transactions ORDER BY id').all();

  sqlite.close();

  console.log(`Found in SQLite:`);
  console.log(`  brands       : ${brands.length}`);
  console.log(`  sellers      : ${sellers.length}`);
  console.log(`  plans        : ${plans.length}`);
  console.log(`  transactions : ${txRows.length} (${txRows.filter(t => !t.deleted_at).length} active)`);
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes written. Remove --dry-run to migrate.');
    return;
  }

  // ── Connect to PostgreSQL ──
  const pool   = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();

  try {
    if (CLEAR) {
      console.log('Clearing existing PostgreSQL data...');
      await client.query('DELETE FROM transactions');
      await client.query('DELETE FROM plans');
      await client.query('DELETE FROM sellers');
      await client.query('DELETE FROM brands');
      // Reset sequences
      await client.query('ALTER SEQUENCE brands_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE sellers_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE plans_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE transactions_id_seq RESTART WITH 1');
      console.log('  Done.\n');
    }

    await client.query('BEGIN');

    // ── Brands ──
    console.log(`Migrating ${brands.length} brands...`);
    for (const b of brands) {
      await client.query(
        'INSERT INTO brands (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
        [b.id, b.name]
      );
    }
    // Sync sequence
    await client.query(`SELECT setval('brands_id_seq', (SELECT MAX(id) FROM brands))`);
    console.log('  Done.');

    // ── Sellers ──
    console.log(`Migrating ${sellers.length} sellers...`);
    for (const s of sellers) {
      await client.query(
        `INSERT INTO sellers (id, name, name_normalized) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_normalized = EXCLUDED.name_normalized`,
        [s.id, s.name, s.name_normalized]
      );
    }
    await client.query(`SELECT setval('sellers_id_seq', (SELECT MAX(id) FROM sellers))`);
    console.log('  Done.');

    // ── Plans ──
    console.log(`Migrating ${plans.length} plans...`);
    for (const p of plans) {
      await client.query(
        `INSERT INTO plans (id, year, brand_id, q1_plan, q2_plan, q3_plan, q4_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           year = EXCLUDED.year, brand_id = EXCLUDED.brand_id,
           q1_plan = EXCLUDED.q1_plan, q2_plan = EXCLUDED.q2_plan,
           q3_plan = EXCLUDED.q3_plan, q4_plan = EXCLUDED.q4_plan`,
        [p.id, p.year, p.brand_id, p.q1_plan, p.q2_plan, p.q3_plan, p.q4_plan]
      );
    }
    await client.query(`SELECT setval('plans_id_seq', (SELECT MAX(id) FROM plans))`);
    console.log('  Done.');

    // ── Transactions ──
    console.log(`Migrating ${txRows.length} transactions...`);
    let txCount  = 0;
    const errors = [];
    for (const tx of txRows) {
      try {
        await client.query(`
          INSERT INTO transactions (
            id, client_name, project_name, seller_id, brand_id,
            sub_brand, vendor_name, opportunity_odoo, brand_opportunity_number,
            due_date, stage_label, status_label, tcv,
            allocation_q1, allocation_q2, allocation_q3, allocation_q4,
            description, invoice_number, notes,
            created_at, updated_at, deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20,
            $21, $22, $23
          ) ON CONFLICT (id) DO NOTHING
        `, [
          tx.id, tx.client_name, tx.project_name, tx.seller_id, tx.brand_id,
          tx.sub_brand, tx.vendor_name, tx.opportunity_odoo, tx.brand_opportunity_number,
          tx.due_date, tx.stage_label, tx.status_label, tx.tcv,
          tx.allocation_q1, tx.allocation_q2, tx.allocation_q3, tx.allocation_q4,
          tx.description, tx.invoice_number, tx.notes,
          tx.created_at, tx.updated_at, tx.deleted_at,
        ]);
        txCount++;
      } catch (e) {
        errors.push({ id: tx.id, client: tx.client_name, error: e.message });
      }
    }
    await client.query(`SELECT setval('transactions_id_seq', (SELECT MAX(id) FROM transactions))`);
    console.log('  Done.');

    await client.query('COMMIT');

    // ── Summary ──
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Migration Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(` Brands migrated       : ${brands.length}`);
    console.log(` Sellers migrated      : ${sellers.length}`);
    console.log(` Plans migrated        : ${plans.length}`);
    console.log(` Transactions migrated : ${txCount}`);
    if (errors.length) {
      console.log(` Errors                : ${errors.length}`);
      errors.forEach(e => console.log(`  x [id=${e.id}] "${e.client}": ${e.error}`));
    }

    const { rows: counts } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS tx,
        (SELECT COUNT(*) FROM plans) AS plans,
        (SELECT COUNT(*) FROM brands) AS brands,
        (SELECT COUNT(*) FROM sellers) AS sellers
    `);
    console.log('\n── PostgreSQL state after migration:');
    console.log(`  transactions (active) : ${counts[0].tx}`);
    console.log(`  plans                 : ${counts[0].plans}`);
    console.log(`  brands                : ${counts[0].brands}`);
    console.log(`  sellers               : ${counts[0].sellers}`);
    console.log('');
    console.log('Done.');

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
