/**
 * Migration: add highlight_color column to transactions table.
 * Run once against local and production databases.
 *
 * Local:
 *   DATABASE_URL=postgresql://localhost/forecast_dev node scripts/migrate-add-highlight-color.js
 *
 * Production (Railway):
 *   DATABASE_URL=<railway-url> node scripts/migrate-add-highlight-color.js
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  console.log('Adding highlight_color column to transactions...');
  await pool.query(`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT NULL
  `);
  console.log('Done.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
