/**
 * Core forecast calculation logic.
 * stage_percent is NEVER stored — always derived here.
 * qN monetary values are NEVER stored — always derived here.
 */

export const STAGE_MAP = {
  'Identified':   0.10,
  'Proposal 25':  0.25,
  'Proposal 50':  0.50,
  'Proposal 75':  0.75,
  'Won':          1.00,
};

export const VALID_STAGES = Object.keys(STAGE_MAP);

/**
 * Adds derived fields to a raw DB transaction row.
 * Does NOT mutate the original row — returns a new object.
 *
 * Derived fields added:
 *   stage_percent, weighted_total, q1_value, q2_value, q3_value, q4_value
 */
export function deriveTransaction(row) {
  const stage_percent = STAGE_MAP[row.stage_label] ?? 0;
  const weighted_total = row.tcv * stage_percent;

  return {
    ...row,
    stage_percent,
    weighted_total,
    q1_value: weighted_total * (row.allocation_q1 ?? 0),
    q2_value: weighted_total * (row.allocation_q2 ?? 0),
    q3_value: weighted_total * (row.allocation_q3 ?? 0),
    q4_value: weighted_total * (row.allocation_q4 ?? 0),
  };
}

/**
 * Null-safe gap calculation.
 * Returns null if plan is null.
 * Returns plan - forecast otherwise.
 */
export function computeGap(plan, forecast) {
  if (plan === null || plan === undefined) return null;
  return plan - (forecast ?? 0);
}

/**
 * Validates stage_label. Returns error string or null.
 */
export function validateStageLabel(stage_label) {
  if (!stage_label) return 'stage_label is required';
  if (!STAGE_MAP[stage_label]) {
    return `Invalid stage_label "${stage_label}". Must be one of: ${VALID_STAGES.join(', ')}`;
  }
  return null;
}

/**
 * Validates status_label. Returns error string or null.
 */
export function validateStatusLabel(status_label) {
  if (status_label === null || status_label === undefined || status_label === '') return null;
  if (status_label !== 'LOSS') return 'status_label must be null or "LOSS"';
  return null;
}

/**
 * Validates allocation values. Returns error string or null.
 */
export function validateAllocations(q1, q2, q3, q4) {
  const vals = [q1, q2, q3, q4];
  for (const [i, v] of vals.entries()) {
    const n = Number(v);
    if (isNaN(n)) return `allocation_q${i + 1} must be a number`;
    if (n < 0 || n > 1) return `allocation_q${i + 1} must be between 0 and 1`;
  }
  const sum = vals.reduce((acc, v) => acc + Number(v), 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    return `Allocations must sum to 1.0 (got ${sum.toFixed(4)})`;
  }
  return null;
}

/**
 * Validates due_date format. Must be YYYY-MM-DD if present.
 * Returns error string or null.
 */
export function validateDueDate(due_date) {
  if (due_date === null || due_date === undefined || due_date === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return 'due_date must be in YYYY-MM-DD format';
  }
  const d = new Date(due_date);
  if (isNaN(d.getTime())) return 'due_date is not a valid date';
  return null;
}

/**
 * Derives the fiscal year from a transaction's due_date.
 * Returns null if due_date is missing.
 */
export function transactionYear(due_date) {
  if (!due_date) return null;
  return new Date(due_date).getUTCFullYear();
}
