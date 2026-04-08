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
  'LOSS':         0,
};

export const VALID_STAGES = Object.keys(STAGE_MAP);

/**
 * Valid quarter values for a transaction.
 * 1Q-4Q means the deal spans all four quarters equally.
 */
export const VALID_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', '1Q-4Q'];

/**
 * Converts a quarter string to allocation values.
 * Q1/Q2/Q3/Q4 → 100% in that quarter, 0 in others.
 * 1Q-4Q       → 25% in each quarter.
 * Returns null if the quarter string is not recognized.
 */
export function quarterToAllocations(quarter) {
  switch (quarter) {
    case 'Q1':   return { allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0 };
    case 'Q2':   return { allocation_q1: 0, allocation_q2: 1, allocation_q3: 0, allocation_q4: 0 };
    case 'Q3':   return { allocation_q1: 0, allocation_q2: 0, allocation_q3: 1, allocation_q4: 0 };
    case 'Q4':   return { allocation_q1: 0, allocation_q2: 0, allocation_q3: 0, allocation_q4: 1 };
    case '1Q-4Q': return { allocation_q1: 0.25, allocation_q2: 0.25, allocation_q3: 0.25, allocation_q4: 0.25 };
    default:     return null;
  }
}

/**
 * Infers the quarter label from allocation values stored on a row.
 * Returns 'Q1', 'Q2', 'Q3', 'Q4', '1Q-4Q', or null if it cannot be inferred.
 */
export function inferQuarter(row) {
  const q1 = row.allocation_q1 ?? 0;
  const q2 = row.allocation_q2 ?? 0;
  const q3 = row.allocation_q3 ?? 0;
  const q4 = row.allocation_q4 ?? 0;

  if (q1 === 1 && q2 === 0 && q3 === 0 && q4 === 0) return 'Q1';
  if (q1 === 0 && q2 === 1 && q3 === 0 && q4 === 0) return 'Q2';
  if (q1 === 0 && q2 === 0 && q3 === 1 && q4 === 0) return 'Q3';
  if (q1 === 0 && q2 === 0 && q3 === 0 && q4 === 1) return 'Q4';
  // Equal split within 0.001 tolerance
  if (Math.abs(q1 - 0.25) < 0.001 && Math.abs(q2 - 0.25) < 0.001 &&
      Math.abs(q3 - 0.25) < 0.001 && Math.abs(q4 - 0.25) < 0.001) return '1Q-4Q';
  return null;
}

/**
 * Returns true if a transaction row is a LOSS record.
 */
export function isLoss(row) {
  return row.stage_label === 'LOSS';
}

/**
 * Adds derived fields to a raw DB transaction row.
 * Does NOT mutate the original row — returns a new object.
 *
 * Derived fields added:
 *   stage_percent, weighted_total, q1_value, q2_value, q3_value, q4_value, quarter
 *
 * For LOSS rows: stage_percent and weighted_total are still derived but the
 * row is excluded from all forecast calculations at the aggregation level.
 */
export function deriveTransaction(row) {
  const stage_percent = STAGE_MAP[row.stage_label] ?? 0;
  const weighted_total = (row.tcv ?? 0) * stage_percent;

  return {
    ...row,
    stage_percent,
    weighted_total,
    q1_value: weighted_total * (row.allocation_q1 ?? 0),
    q2_value: weighted_total * (row.allocation_q2 ?? 0),
    q3_value: weighted_total * (row.allocation_q3 ?? 0),
    q4_value: weighted_total * (row.allocation_q4 ?? 0),
    quarter:  inferQuarter(row),
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
  if (!(stage_label in STAGE_MAP)) {
    return `Invalid stage_label "${stage_label}". Must be one of: ${VALID_STAGES.join(', ')}`;
  }
  return null;
}

/**
 * Validates quarter field. Returns error string or null.
 * Pass isLossRow=true to skip quarter validation for LOSS records.
 */
export function validateQuarter(quarter, isLossRow = false) {
  if (isLossRow) return null; // quarter not required for LOSS
  if (!quarter) return 'quarter is required';
  if (!VALID_QUARTERS.includes(quarter)) {
    return `Invalid quarter "${quarter}". Must be one of: ${VALID_QUARTERS.join(', ')}`;
  }
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
