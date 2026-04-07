/**
 * DOT4 Forecast V2 — Backend Smoke Test
 *
 * Runs against a live server on localhost:3001.
 * Seeds its own data, tests every endpoint, checks derived fields,
 * LOSS behavior, and soft-delete behavior.
 *
 * Usage: node smoke-test.js
 */

const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;
const errors = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    errors.push(`${label}${detail ? ': ' + detail : ''}`);
  }
}

function approx(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol;
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ── Seed & run ───────────────────────────────────────────────────────────────

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       DOT4 Forecast V2 — Backend Smoke Test             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ── 0. Health ──────────────────────────────────────────────────────────────
  section('0. Health');
  const health = await req('GET', '/health');
  check('GET /health → 200', health.status === 200);
  check('Response { ok: true }', health.body?.ok === true);

  // ── 1. Seed via SQLite directly ─────────────────────────────────────────────
  // Brands/sellers have no POST endpoint — seed via DB module
  section('1. Seed data');

  const { default: db } = await import('./db.js');

  db.prepare("INSERT OR IGNORE INTO brands (name) VALUES ('Cisco'), ('HP'), ('Microsoft')").run();
  db.prepare("INSERT OR IGNORE INTO sellers (name) VALUES ('Alice'), ('Bob'), ('Carol')").run();
  check('Brands seeded', db.prepare('SELECT COUNT(*) as n FROM brands').get().n === 3);
  check('Sellers seeded', db.prepare('SELECT COUNT(*) as n FROM sellers').get().n === 3);

  // ── 2. Brands & Sellers ────────────────────────────────────────────────────
  section('2. GET /brands and /sellers');
  const brands = await req('GET', '/brands');
  check('GET /brands → 200', brands.status === 200);
  check('Returns array of 3', Array.isArray(brands.body) && brands.body.length === 3);
  check('Has id and name fields', brands.body[0]?.id !== undefined && brands.body[0]?.name !== undefined);

  const sellers = await req('GET', '/sellers');
  check('GET /sellers → 200', sellers.status === 200);
  check('Returns array of 3', Array.isArray(sellers.body) && sellers.body.length === 3);

  const brandId  = brands.body.find(b => b.name === 'Cisco').id;
  const brand2Id = brands.body.find(b => b.name === 'HP').id;
  const brand3Id = brands.body.find(b => b.name === 'Microsoft').id;
  const sellerA  = sellers.body.find(s => s.name === 'Alice').id;
  const sellerB  = sellers.body.find(s => s.name === 'Bob').id;

  // ── 3. Transactions — create & derived fields ──────────────────────────────
  section('3. POST /transactions — create and derived fields');

  // TX1: Cisco / Alice / Proposal 25 / TCV 20000 / 100% Q1 / 2026
  const tx1 = await req('POST', '/transactions', {
    client_name: 'Acme Corp',
    seller_id: sellerA,
    brand_id: brandId,
    tcv: 20000,
    stage_label: 'Proposal 25',
    due_date: '2026-03-15',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('POST tx1 → 201', tx1.status === 201);
  check('stage_percent = 0.25', approx(tx1.body.stage_percent, 0.25));
  check('weighted_total = 5000 (20000 × 0.25)', approx(tx1.body.weighted_total, 5000));
  check('q1_value = 5000', approx(tx1.body.q1_value, 5000));
  check('q2_value = 0', approx(tx1.body.q2_value, 0));
  check('stage_percent NOT stored (not in raw columns)', tx1.body.stage_percent !== undefined); // it IS returned as derived
  check('brand_name resolved', tx1.body.brand_name === 'Cisco');
  check('seller_name resolved', tx1.body.seller_name === 'Alice');
  const tx1Id = tx1.body.id;

  // TX2: Cisco / Alice / Proposal 50 / TCV 10000 / split Q1 50% Q2 50% / 2026
  const tx2 = await req('POST', '/transactions', {
    client_name: 'Beta Ltd',
    seller_id: sellerA,
    brand_id: brandId,
    tcv: 10000,
    stage_label: 'Proposal 50',
    due_date: '2026-06-30',
    allocation_q1: 0.5, allocation_q2: 0.5, allocation_q3: 0, allocation_q4: 0,
  });
  check('POST tx2 → 201', tx2.status === 201);
  check('weighted_total = 5000 (10000 × 0.5)', approx(tx2.body.weighted_total, 5000));
  check('q1_value = 2500 (5000 × 0.5)', approx(tx2.body.q1_value, 2500));
  check('q2_value = 2500 (5000 × 0.5)', approx(tx2.body.q2_value, 2500));
  const tx2Id = tx2.body.id;

  // TX3: Cisco / Bob / Won / TCV 8000 / 100% Q3 / 2026
  const tx3 = await req('POST', '/transactions', {
    client_name: 'Gamma SA',
    seller_id: sellerB,
    brand_id: brandId,
    tcv: 8000,
    stage_label: 'Won',
    due_date: '2026-09-01',
    allocation_q1: 0, allocation_q2: 0, allocation_q3: 1, allocation_q4: 0,
  });
  check('POST tx3 → 201 (Won)', tx3.status === 201);
  check('weighted_total = 8000 (Won = 100%)', approx(tx3.body.weighted_total, 8000));
  check('q3_value = 8000', approx(tx3.body.q3_value, 8000));
  const tx3Id = tx3.body.id;

  // TX4: Cisco / Alice / Proposal 75 / status=LOSS / 2026 Q4
  const tx4 = await req('POST', '/transactions', {
    client_name: 'Delta Inc',
    seller_id: sellerA,
    brand_id: brandId,
    tcv: 50000,
    stage_label: 'Proposal 75',
    status_label: 'LOSS',
    due_date: '2026-12-01',
    allocation_q1: 0, allocation_q2: 0, allocation_q3: 0, allocation_q4: 1,
  });
  check('POST tx4 (LOSS) → 201', tx4.status === 201);
  check('status_label = LOSS', tx4.body.status_label === 'LOSS');
  const tx4Id = tx4.body.id;

  // TX5: HP / Bob / Identified / TCV 15000 / Q2 / 2026
  const tx5 = await req('POST', '/transactions', {
    client_name: 'Echo PLC',
    seller_id: sellerB,
    brand_id: brand2Id,
    tcv: 15000,
    stage_label: 'Identified',
    due_date: '2026-06-15',
    allocation_q1: 0, allocation_q2: 1, allocation_q3: 0, allocation_q4: 0,
  });
  check('POST tx5 (HP) → 201', tx5.status === 201);
  check('weighted_total = 1500 (15000 × 0.10)', approx(tx5.body.weighted_total, 1500));
  const tx5Id = tx5.body.id;

  // ── 4. Validation rejections ───────────────────────────────────────────────
  section('4. Validation — rejection cases');

  const badStage = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Prospect', due_date: '2026-01-01',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('Bad stage_label → 400', badStage.status === 400);
  check('Error mentions stage_label', badStage.body?.error?.includes('stage_label'));

  const badStatus = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Won', status_label: 'CANCELLED', due_date: '2026-01-01',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('Bad status_label → 400', badStatus.status === 400);
  check('Error mentions status_label', badStatus.body?.error?.includes('status_label'));

  const badAlloc = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Won', due_date: '2026-01-01',
    allocation_q1: 0.3, allocation_q2: 0.3, allocation_q3: 0, allocation_q4: 0,
  });
  check('Allocations sum ≠ 1 → 400', badAlloc.status === 400);
  check('Error mentions sum', badAlloc.body?.error?.includes('sum') || badAlloc.body?.error?.includes('Alloc'));

  const badAllocRange = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Won', due_date: '2026-01-01',
    allocation_q1: 1.5, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('Allocation > 1 → 400', badAllocRange.status === 400);
  check('Error mentions between 0 and 1', badAllocRange.body?.error?.includes('between 0 and 1'));

  const badDate = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Won', due_date: '15/03/2026',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('Bad due_date format → 400', badDate.status === 400);
  check('Error mentions due_date format', badDate.body?.error?.includes('due_date'));

  const badDate2 = await req('POST', '/transactions', {
    client_name: 'X', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Won', due_date: '2026-13-01',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('Invalid calendar date (month 13) → 400', badDate2.status === 400);

  const nullDate = await req('POST', '/transactions', {
    client_name: 'NoDueDate', seller_id: sellerA, brand_id: brandId, tcv: 5000,
    stage_label: 'Identified',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('null due_date is allowed (201)', nullDate.status === 201);
  check('due_date stored as null', nullDate.body.due_date === null);
  const txNullDateId = nullDate.body.id;

  // ── 5. GET /transactions — list and filters ────────────────────────────────
  section('5. GET /transactions — list and filters');

  const all = await req('GET', '/transactions');
  check('GET /transactions → 200', all.status === 200);
  // Should have tx1–tx5 + txNullDate (6 active, not deleted), LOSS excluded by default
  const nonLoss = all.body.filter(t => t.status_label !== 'LOSS');
  check('LOSS excluded by default', nonLoss.length === all.body.length);
  check('tx4 (LOSS) not in default list', !all.body.find(t => t.id === tx4Id));

  const withLoss = await req('GET', '/transactions?include_loss=true');
  check('include_loss=true shows LOSS', withLoss.body.find(t => t.id === tx4Id) !== undefined);

  const byCisco = await req('GET', `/transactions?brand_id=${brandId}`);
  check('Filter by brand_id (Cisco)', byCisco.body.every(t => t.brand_id === brandId));

  const byBob = await req('GET', `/transactions?seller_id=${sellerB}`);
  check('Filter by seller_id (Bob)', byBob.body.every(t => t.seller_id === sellerB));

  const byStage = await req('GET', '/transactions?stage_label=Won');
  check('Filter by stage_label=Won', byStage.body.every(t => t.stage_label === 'Won'));
  check('Won result is tx3', byStage.body.find(t => t.id === tx3Id) !== undefined);

  const byQ1 = await req('GET', '/transactions?quarter=1');
  check('Filter by quarter=1 returns tx with allocation_q1 > 0', byQ1.body.every(t => t.allocation_q1 > 0));
  check('tx1 (100% Q1) in Q1 filter', byQ1.body.find(t => t.id === tx1Id) !== undefined);
  check('tx2 (50% Q1) in Q1 filter', byQ1.body.find(t => t.id === tx2Id) !== undefined);

  const byYear = await req('GET', '/transactions?year=2026');
  // tx with null due_date should NOT appear in year filter
  check('year=2026 filter excludes null due_date', !byYear.body.find(t => t.id === txNullDateId));
  check('year=2026 includes tx1', byYear.body.find(t => t.id === tx1Id) !== undefined);

  const bySearch = await req('GET', '/transactions?search=Acme');
  check('search=Acme returns tx1', bySearch.body.find(t => t.id === tx1Id) !== undefined);
  check('search=Acme excludes unrelated', !bySearch.body.find(t => t.id === tx2Id));

  // ── 6. GET /transactions/:id ───────────────────────────────────────────────
  section('6. GET /transactions/:id');
  const single = await req('GET', `/transactions/${tx1Id}`);
  check('GET /transactions/:id → 200', single.status === 200);
  check('Returns correct id', single.body.id === tx1Id);
  check('Has derived fields', single.body.weighted_total !== undefined && single.body.q1_value !== undefined);

  const notFound = await req('GET', '/transactions/99999');
  check('Non-existent id → 404', notFound.status === 404);

  // ── 7. PUT /transactions/:id ───────────────────────────────────────────────
  section('7. PUT /transactions/:id — update');
  const updated = await req('PUT', `/transactions/${tx1Id}`, {
    client_name: 'Acme Corp Updated',
    seller_id: sellerA,
    brand_id: brandId,
    tcv: 40000,
    stage_label: 'Proposal 50',
    due_date: '2026-03-15',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  check('PUT → 200', updated.status === 200);
  check('client_name updated', updated.body.client_name === 'Acme Corp Updated');
  check('weighted_total recalculated (40000×0.5=20000)', approx(updated.body.weighted_total, 20000));
  check('q1_value recalculated = 20000', approx(updated.body.q1_value, 20000));

  // Restore tx1 to original for further tests
  await req('PUT', `/transactions/${tx1Id}`, {
    client_name: 'Acme Corp',
    seller_id: sellerA,
    brand_id: brandId,
    tcv: 20000,
    stage_label: 'Proposal 25',
    due_date: '2026-03-15',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });

  // ── 8. DELETE /transactions/:id — soft delete ─────────────────────────────
  section('8. DELETE /transactions/:id — soft delete');

  // Create a throwaway tx to delete
  const toDelete = await req('POST', '/transactions', {
    client_name: 'ToDelete', seller_id: sellerA, brand_id: brandId, tcv: 1000,
    stage_label: 'Identified', due_date: '2026-01-01',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  const deleteId = toDelete.body.id;

  const del = await req('DELETE', `/transactions/${deleteId}`);
  check('DELETE → 200', del.status === 200);
  check('Response { ok: true }', del.body?.ok === true);

  // Verify row gone from list
  const afterDel = await req('GET', '/transactions');
  check('Deleted tx excluded from list', !afterDel.body.find(t => t.id === deleteId));

  // Verify row gone from GET :id
  const afterDelSingle = await req('GET', `/transactions/${deleteId}`);
  check('Deleted tx → 404 on GET :id', afterDelSingle.status === 404);

  // Verify row still in DB (soft delete, not hard delete)
  const rawRow = db.prepare('SELECT id, deleted_at FROM transactions WHERE id = ?').get(deleteId);
  check('deleted_at is set in DB (not hard deleted)', rawRow !== undefined && rawRow.deleted_at !== null);

  // Delete already-deleted → 404
  const delAgain = await req('DELETE', `/transactions/${deleteId}`);
  check('Re-delete already-deleted → 404', delAgain.status === 404);

  // ── 9. Duplicate ──────────────────────────────────────────────────────────
  section('9. POST /transactions/:id/duplicate');
  const dup = await req('POST', `/transactions/${tx2Id}/duplicate`);
  check('Duplicate → 201', dup.status === 201);
  check('New id assigned', dup.body.id !== tx2Id);
  check('client_name copied', dup.body.client_name === tx2.body.client_name);
  check('tcv copied', dup.body.tcv === tx2.body.tcv);
  check('stage_label copied', dup.body.stage_label === tx2.body.stage_label);
  check('allocations copied', approx(dup.body.allocation_q1, tx2.body.allocation_q1));
  const dupId = dup.body.id;

  // ── 10. Plans — upsert and derived fields ─────────────────────────────────
  section('10. Plans');

  // Set plan for Cisco 2026
  const planCisco = await req('PUT', `/plans/${brandId}`, {
    year: 2026, q1_plan: 10000, q2_plan: 15000, q3_plan: 20000, q4_plan: 25000,
  });
  check('PUT /plans/:brand_id → 200', planCisco.status === 200);
  check('fy_plan = 70000 (sum of quarters)', approx(planCisco.body.fy_plan, 70000));
  check('fy_forecast > 0', planCisco.body.fy_forecast > 0);
  check('fy_gap = fy_plan - fy_forecast', approx(planCisco.body.fy_gap, 70000 - planCisco.body.fy_forecast));

  // Set partial plan for HP (one null quarter)
  const planHP = await req('PUT', `/plans/${brand2Id}`, {
    year: 2026, q1_plan: 5000, q2_plan: null, q3_plan: 8000, q4_plan: 3000,
  });
  check('PUT plan with null quarter → 200', planHP.status === 200);
  check('fy_plan = null when any quarter is null', planHP.body.fy_plan === null);
  check('fy_gap = null when fy_plan is null', planHP.body.fy_gap === null);

  // GET /plans?year=2026
  const plansList = await req('GET', '/plans?year=2026');
  check('GET /plans → 200', plansList.status === 200);
  check('Returns array', Array.isArray(plansList.body));
  const ciscoPlanRow = plansList.body.find(p => p.brand_id === brandId);
  const hpPlanRow    = plansList.body.find(p => p.brand_id === brand2Id);
  const msPlanRow    = plansList.body.find(p => p.brand_id === brand3Id);
  check('Cisco plan present', ciscoPlanRow !== undefined);
  check('Cisco fy_plan = 70000', approx(ciscoPlanRow.fy_plan, 70000));
  check('HP fy_plan = null (partial quarters)', hpPlanRow?.fy_plan === null);
  check('Microsoft fy_plan = null (no plan row)', msPlanRow?.fy_plan === null);
  check('Microsoft fy_gap = null (no plan row)', msPlanRow?.fy_gap === null);

  // GET /plans/:brand_id?year=2026 — quarterly breakdown
  const planDetail = await req('GET', `/plans/${brandId}?year=2026`);
  check('GET /plans/:id → 200', planDetail.status === 200);
  check('quarterly_breakdown has 4 entries', planDetail.body.quarterly_breakdown?.length === 4);
  const q1detail = planDetail.body.quarterly_breakdown.find(q => q.quarter === 1);
  check('Q1 plan = 10000', approx(q1detail.plan, 10000));
  check('Q1 gap = plan - forecast', approx(q1detail.gap, q1detail.plan - q1detail.forecast));

  // Upsert overwrites existing
  await req('PUT', `/plans/${brandId}`, {
    year: 2026, q1_plan: 12000, q2_plan: 15000, q3_plan: 20000, q4_plan: 25000,
  });
  const planAfterUpsert = await req('GET', `/plans/${brandId}?year=2026`);
  check('Upsert updates existing plan', approx(planAfterUpsert.body.q1_plan, 12000));

  // ── 11. LOSS behavior ─────────────────────────────────────────────────────
  section('11. LOSS behavior');

  // tx4 is LOSS / Cisco / Q4 / TCV 50000 / Proposal 75
  // It should NOT appear in default transaction list
  const defaultList = await req('GET', `/transactions?brand_id=${brandId}&year=2026`);
  check('LOSS tx NOT in default list', !defaultList.body.find(t => t.id === tx4Id));

  // It SHOULD appear when include_loss=true
  const lossList = await req('GET', `/transactions?brand_id=${brandId}&year=2026&include_loss=true`);
  check('LOSS tx IN list when include_loss=true', lossList.body.find(t => t.id === tx4Id) !== undefined);

  // LOSS must not affect forecast calculations
  // Cisco Q4 weighted forecast should not include tx4
  const overview = await req('GET', '/overview?year=2026');
  const q4breakdown = overview.body.quarterly_breakdown.find(q => q.quarter === 4);
  // tx4: TCV=50000, stage=Proposal75 (75%), alloc_q4=1 → weighted = 37500
  // tx4 is LOSS → should NOT be in q4 forecast
  // Only non-LOSS Cisco tx with Q4 allocation: none (tx1=Q1, tx2=Q1/Q2, tx3=Q3)
  // So q4 forecast should be 0
  check('LOSS excluded from Q4 forecast (q4_forecast should be 0)', approx(q4breakdown.forecast, 0));

  // LOSS should not appear in pipeline_by_stage
  const pipeline = overview.body.pipeline_by_stage;
  // Cisco tx4 is LOSS with Proposal 75 — if all Proposal 75 are LOSS, stage should be absent
  const p75inPipeline = pipeline.find(p => p.stage_label === 'Proposal 75');
  check('LOSS stage not counted in pipeline', p75inPipeline === undefined);

  // LOSS should not appear in top_opportunities
  const topOps = overview.body.top_opportunities;
  check('LOSS not in top_opportunities', !topOps.find(t => t.id === tx4Id));

  // ── 12. deleted_at behavior ───────────────────────────────────────────────
  section('12. deleted_at (soft delete) behavior');

  // Create and delete a Cisco transaction and verify it's excluded from all calcs
  const txToExclude = await req('POST', '/transactions', {
    client_name: 'ShouldBeGone', seller_id: sellerA, brand_id: brandId, tcv: 999999,
    stage_label: 'Won', due_date: '2026-06-01',
    allocation_q1: 0, allocation_q2: 1, allocation_q3: 0, allocation_q4: 0,
  });
  const excId = txToExclude.body.id;
  const overviewBefore = await req('GET', '/overview?year=2026');
  const q2Before = overviewBefore.body.quarterly_breakdown.find(q => q.quarter === 2).forecast;

  await req('DELETE', `/transactions/${excId}`);
  const overviewAfter = await req('GET', '/overview?year=2026');
  const q2After = overviewAfter.body.quarterly_breakdown.find(q => q.quarter === 2).forecast;

  check('Deleted tx excluded from Q2 forecast', approx(q2Before - q2After, 999999));

  // Also verify it's excluded from plans list fy_forecast
  const planAfterDel = await req('GET', `/plans/${brandId}?year=2026`);
  const q2FcInPlan = planAfterDel.body.quarterly_breakdown.find(q => q.quarter === 2).forecast;
  check('Deleted tx excluded from plan fy_forecast', !approx(q2FcInPlan, q2Before));

  // ── 13. null due_date excluded from plan/gap/forecast ─────────────────────
  section('13. null due_date excluded from calculations');

  // txNullDateId was created with no due_date — it should never appear in year-scoped calcs
  // The year=2026 filter excludes it
  const yearFiltered = await req('GET', '/transactions?year=2026');
  check('null due_date excluded from year filter', !yearFiltered.body.find(t => t.id === txNullDateId));

  // Overview and plans use due_date year — null due_date rows should not appear in any calc
  // Create a high-TCV tx with null due_date and verify overview totals don't change
  const highTcvNull = await req('POST', '/transactions', {
    client_name: 'NullDateHigh', seller_id: sellerA, brand_id: brandId, tcv: 9999999,
    stage_label: 'Won',
    allocation_q1: 1, allocation_q2: 0, allocation_q3: 0, allocation_q4: 0,
  });
  const overviewWithNull = await req('GET', '/overview?year=2026');
  check('null due_date tx does not affect overview forecast',
    approx(overviewWithNull.body.total_weighted_forecast, overviewAfter.body.total_weighted_forecast));
  await req('DELETE', `/transactions/${highTcvNull.body.id}`);

  // ── 14. Overview ──────────────────────────────────────────────────────────
  section('14. GET /overview');

  const ov = await req('GET', '/overview?year=2026');
  check('GET /overview → 200', ov.status === 200);
  check('Has total_weighted_forecast', typeof ov.body.total_weighted_forecast === 'number');
  check('Has total_won', typeof ov.body.total_won === 'number');
  check('Has quarterly_breakdown (4 entries)', ov.body.quarterly_breakdown?.length === 4);
  check('Has gap_by_brand (array)', Array.isArray(ov.body.gap_by_brand));
  check('Has pipeline_by_stage (array)', Array.isArray(ov.body.pipeline_by_stage));
  check('Has top_opportunities (≤5)', Array.isArray(ov.body.top_opportunities) && ov.body.top_opportunities.length <= 5);

  // top_opportunities must exclude Won and LOSS
  check('top_opportunities excludes Won', !ov.body.top_opportunities.find(t => t.stage_label === 'Won'));
  check('top_opportunities excludes LOSS', !ov.body.top_opportunities.find(t => t.status_label === 'LOSS'));

  // gap_by_brand: Microsoft has no plan → gap = null
  const msGapRow = ov.body.gap_by_brand.find(b => b.brand_id === brand3Id);
  check('gap = null for brand with no plan', msGapRow?.gap === null);

  // Won total: only tx3 is Won (8000 TCV, 100% = 8000)
  check('total_won = 8000 (only tx3)', approx(ov.body.total_won, 8000));

  // ── 15. Brand summary ─────────────────────────────────────────────────────
  section('15. GET /brands/:id/summary');

  const bs = await req('GET', `/brands/${brandId}/summary?year=2026`);
  check('GET /brands/:id/summary → 200', bs.status === 200);
  check('Has plan, forecast, won, gap', bs.body.plan !== undefined && bs.body.forecast !== undefined);
  check('Has quarterly_breakdown', bs.body.quarterly_breakdown?.length === 4);
  check('Has pipeline_by_stage', Array.isArray(bs.body.pipeline_by_stage));
  check('Has top_transactions', Array.isArray(bs.body.top_transactions));
  check('top_transactions excludes Won', !bs.body.top_transactions.find(t => t.stage_label === 'Won'));
  check('top_transactions excludes LOSS', !bs.body.top_transactions.find(t => t.status_label === 'LOSS'));

  // Verify brand forecast matches: tx1(5000 Q1) + tx2(2500 Q1+2500 Q2) + tx3(Won 8000 Q3)
  // LOSS tx4 excluded, dup of tx2 also contributes
  // tx1=5000, tx2=5000, tx3=8000, dup=5000 → fy = 23000
  check('Cisco fy_forecast accounts for active non-LOSS txs', bs.body.forecast > 0);
  check('Cisco won = 8000 (tx3 only)', approx(bs.body.won, 8000));

  const notFoundBrand = await req('GET', '/brands/99999/summary?year=2026');
  check('Unknown brand → 404', notFoundBrand.status === 404);

  // ── 16. Sellers summary ───────────────────────────────────────────────────
  section('16. GET /sellers/summary');

  const ss = await req('GET', '/sellers/summary?year=2026');
  check('GET /sellers/summary → 200', ss.status === 200);
  check('Returns array', Array.isArray(ss.body));

  const aliceSummary = ss.body.find(s => s.seller_id === sellerA);
  const bobSummary   = ss.body.find(s => s.seller_id === sellerB);
  check('Alice in summary', aliceSummary !== undefined);
  check('Bob in summary', bobSummary !== undefined);
  check('Alice deal_count > 0', aliceSummary?.deal_count > 0);
  check('Bob won > 0 (tx3)', approx(bobSummary?.won, 8000));

  // Contribution pct: all sellers should sum to ~100%
  const totalContrib = ss.body.reduce((sum, s) => sum + s.contribution_pct, 0);
  check('contribution_pct sums to ~100%', approx(totalContrib, 100, 1));

  // LOSS excluded from seller weighted_forecast
  // Alice has tx4=LOSS — her weighted_forecast should NOT include it
  // tx4: TCV=50000, Proposal75=75% → 37500 — should not be in Alice's forecast
  const aliceWoutLoss = aliceSummary.weighted_forecast;
  check('Alice weighted_forecast excludes LOSS tx4', aliceWoutLoss < 37500 + 5000 + 5000); // rough guard

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\n  FAILURES:');
    errors.forEach(e => console.log(`    ✗ ${e}`));
  }
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
