/**
 * Sets odoo_user_id on sellers in production.
 * Run once against Railway DB:
 *   DATABASE_URL=<railway-url> node scripts/migrate-odoo-user-ids.js
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

const mappings = [
  { name: 'Alejandro Simeone',    odoo_user_id: 35 },
  { name: 'Brian Zino',           odoo_user_id: 37 },
  { name: 'Christian Braun',      odoo_user_id: 38 },
  { name: 'Claudio Guerra',       odoo_user_id: 39 },
  { name: 'Fabio Villamayor',     odoo_user_id: 42 },
  { name: 'Carlos Furnkorn',      odoo_user_id: 45 },
  { name: 'Milton Gallo',         odoo_user_id: 47 },
  { name: 'Carlos Lopez',         odoo_user_id: 49 },
  { name: 'Mariano Basso',        odoo_user_id: 62 },
  { name: 'Oscar Ontano',         odoo_user_id: 55 },
  { name: 'Juan Carlos Romitelli',odoo_user_id: 57 },
  { name: 'Sandra Tedesco',       odoo_user_id: 59 },
  { name: 'Florencia Vargas',     odoo_user_id: 60 },
  { name: 'Mathias Villamayor',   odoo_user_id: 61 },
  { name: 'Juan Manuel Basso',    odoo_user_id: 36 },
  { name: 'Gabriel Acosta',       odoo_user_id: 34 },
  { name: 'Franco Nicora',        odoo_user_id: 52 },
];

for (const { name, odoo_user_id } of mappings) {
  const res = await pool.query(
    'UPDATE sellers SET odoo_user_id = $1 WHERE name = $2',
    [odoo_user_id, name]
  );
  if (res.rowCount > 0) {
    console.log(`✓ ${name} → ${odoo_user_id}`);
  } else {
    console.warn(`✗ Not found: ${name}`);
  }
}

await pool.end();
console.log('Done.');
