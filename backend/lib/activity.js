/**
 * Inserts a row into activity_logs.
 * Call after any successful write operation.
 *
 * @param {import('pg').Pool} pool
 * @param {object} opts
 * @param {string} opts.action       - 'create' | 'edit' | 'delete' | 'duplicate'
 * @param {number} [opts.entityId]   - transaction id
 * @param {object} opts.user         - req.user
 * @param {object} [opts.details]    - free-form context stored as JSONB
 */
export async function logActivity(pool, { action, entityId, user, details }) {
  const performedBy = user?.sellerName ?? user?.username ?? 'unknown'
  const performedByRole = user?.role ?? 'unknown'
  await pool.query(
    `INSERT INTO activity_logs (action, entity_id, performed_by, performed_by_role, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [action, entityId ?? null, performedBy, performedByRole, details ? JSON.stringify(details) : null]
  )
}
