import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, 'forecast.db');

const db = new Database(DB_PATH);

// Apply schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: add name_normalized to sellers and merge duplicates
migrateSellers(db);

export default db;

// ─── Migrations ──────────────────────────────────────────────────────────────

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

function migrateSellers(db) {
  const cols = db.prepare('PRAGMA table_info(sellers)').all();
  const hasNormalized = cols.some(c => c.name === 'name_normalized');

  if (!hasNormalized) {
    db.exec('ALTER TABLE sellers ADD COLUMN name_normalized TEXT');
    db.prepare('UPDATE sellers SET name_normalized = lower(trim(name))').run();
    const merged = mergeDuplicateSellers(db);
    if (merged > 0) {
      console.log(`[migration] Merged ${merged} duplicate seller group(s).`);
    }
  }

  // Ensure unique index exists (safe to run on every startup)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_name_normalized ON sellers(name_normalized)');
}
