import pool from '../db.js'

async function run() {
  console.log('Adding audit columns to transactions...')
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by TEXT`)
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ`)
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS loss_at TIMESTAMPTZ`)
  console.log('Done.')
  await pool.end()
}

run().catch((err) => { console.error(err); process.exit(1) })
