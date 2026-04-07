/**
 * probe-excel.js
 * Dumps the raw structure of DATADOT.xlsx so we can confirm
 * row indices before writing the real import script.
 *
 * Usage:
 *   node scripts/probe-excel.js /path/to/DATADOT.xlsx
 */

import XLSX from 'xlsx';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/probe-excel.js <path-to-xlsx>');
  process.exit(1);
}

const wb = XLSX.readFile(resolve(filePath));
console.log('\n=== Sheets ===');
console.log(wb.SheetNames);

const sheetName = wb.SheetNames.find(n => n.includes('PLAN')) || wb.SheetNames[0];
console.log(`\n=== Using sheet: "${sheetName}" ===`);

const ws = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

console.log(`\nTotal rows: ${rows.length}`);
console.log('\n=== First 60 rows (row index | content) ===');
rows.slice(0, 60).forEach((row, i) => {
  const nonNull = row.filter(c => c !== null && c !== undefined && c !== '');
  if (nonNull.length > 0) {
    console.log(`[${String(i).padStart(3)}]`, JSON.stringify(row.slice(0, 18)));
  }
});
