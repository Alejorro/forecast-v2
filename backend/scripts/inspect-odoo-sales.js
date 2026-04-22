/**
 * One-shot script to inspect sale.order fields and a sample record from Odoo.
 * Run: node --env-file=.env scripts/inspect-odoo-sales.js
 */

import { createOdooClient } from '../lib/odoo-client.js';

const odoo = createOdooClient();

// Authenticate first
await odoo.authenticate();
console.log('Authenticated OK');

// 1. Get all fields on sale.order
const fields = await odoo._rpc('/web/dataset/call_kw', {
  model: 'sale.order',
  method: 'fields_get',
  args: [],
  kwargs: { attributes: ['string', 'type'], context: {} },
});

console.log('\n=== sale.order FIELDS ===');
for (const [key, val] of Object.entries(fields).sort()) {
  console.log(`  ${key.padEnd(40)} ${val.type.padEnd(12)} "${val.string}"`);
}

// 2. Fetch one real record to see actual values
const sample = await odoo.searchRead(
  'sale.order',
  [['invoice_status', 'in', ['to invoice', 'invoiced']]],
  [],  // empty = all fields
  { limit: 1 }
);

if (sample.length) {
  console.log('\n=== SAMPLE RECORD ===');
  const rec = sample[0];
  for (const [key, val] of Object.entries(rec).sort()) {
    if (val !== false && val !== null && val !== '') {
      console.log(`  ${key.padEnd(40)} ${JSON.stringify(val)}`);
    }
  }
} else {
  console.log('\nNo records found with invoice_status in (to invoice, invoiced)');
}
