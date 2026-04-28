# IMPORT.md

## Overview

The import script reads `DATADOT.xlsx` and loads plans and transactions into the PostgreSQL database.

Script location: `backend/scripts/import-datadot.js`

It handles:
- Plans from the top section of sheet "PLAN 2026"
- Active transactions from the main table of sheet "PLAN 2026"
- LOSS transactions from the separate "LOSS" sheet

---

## How to run

Run from the `backend/` directory:

```bash
# Standard import (idempotent — upserts plans, appends transactions)
node scripts/import-datadot.js DATADOT.xlsx

# Preview only — no writes to DB
node scripts/import-datadot.js DATADOT.xlsx --dry-run

# Wipe all existing plans and transactions, then reimport
node scripts/import-datadot.js DATADOT.xlsx --clear
```

The Excel file defaults to `./DATADOT.xlsx` if no path is given.

---

## Excel structure

### Sheet: "PLAN 2026"

**Top section — Plans** (`Distribución de Cuota 2026 por Brand`)
Rows 2–6 (0-indexed). One row per brand.

| Column | Content |
|--------|---------|
| [0] | Brand name |
| [6] | Q1 plan |
| [7] | Q2 plan |
| [8] | Q3 plan |
| [9] | Q4 plan |

The "Total 2026" row terminates this section and is ignored.

---

**Main section — Transactions** (`Detalle de Transacciones (Forecast)`)
Starts at row 21 (0-indexed). One row per transaction.

| Column | Content |
|--------|---------|
| [0] | Cliente - Proyecto → `client_name` |
| [1] | Quarter → used to derive `due_date` |
| [2] | Oportunidad en ODOO → `opportunity_odoo` |
| [3] | Nro de oportunidad en la marca → `brand_opportunity_number` |
| [5] | Vendedor → `seller_name` |
| [6] | Brand → `brand_name` |
| [7] | Sub-brand → `sub_brand` |
| [8] | Marca → `vendor_name` |
| [9] | Status → `status_label` (LOSS detection only) |
| [13] | Odd → `stage_label` |
| [14] | TCV → `tcv` |
| [15] | 1Q weighted value → used to derive `allocation_q1` |
| [16] | 2Q weighted value → used to derive `allocation_q2` |
| [17] | 3Q weighted value → used to derive `allocation_q3` |
| [18] | 4Q weighted value → used to derive `allocation_q4` |
| [22] | Descripcion → `notes` |
| [23] | Nro de Factura → `invoice_number` |

Rows 295–306 are seller-level subtotals. They are automatically skipped because their Brand column contains numeric garbage values that don't match any known brand.

---

### Sheet: "LOSS"

Contains LOSS transactions. Most rows use the same column layout as the main sheet, but some rows have an extra Quarter column inserted at [1] that shifts the subsequent columns by one position.

Detection: if `r[1]` is one of `1Q`, `2Q`, `3Q`, `4Q`, the shifted layout is used.

LOSS rows always have `odd = 0`. The script assigns `stage_label = LOSS` and `status_label = LOSS`, with zero quarter allocations.

---

## Mapping rules

### Odd → stage_label

| Odd value | stage_label |
|-----------|-------------|
| 0.10 | Identified |
| 0.25 | Proposal 25 |
| 0.50 | Proposal 50 |
| 0.75 | Proposal 75 |
| 1.00 | Won |

Stage is always derived from Odd. The Status column is not used for this.

---

### Status → status_label

| Status value | status_label |
|--------------|--------------|
| `LOSS` | `LOSS` |
| anything else | `null` |

---

### Quarter → due_date

| Quarter | due_date |
|---------|----------|
| 1Q | 2026-03-31 |
| 2Q | 2026-06-30 |
| 3Q | 2026-09-30 |
| 4Q | 2026-12-31 |
| (absent) | `null` |

---

### Q1–Q4 → allocations

The Excel stores weighted values per quarter, not allocation fractions.

Derivation:

```
weighted_total = q1 + q2 + q3 + q4
allocation_q1  = q1 / weighted_total
allocation_q2  = q2 / weighted_total
allocation_q3  = q3 / weighted_total
allocation_q4  = q4 / weighted_total
```

The allocation sum must equal 1.0 (tolerance: ±0.001). Rows where all quarter values are zero are skipped.

---

### Brand normalization

| Excel name | Canonical name |
|------------|----------------|
| NETWORKING/PRINTERS | NETWORKING |
| AUDIO/VIDEO + DC | AUDIO/VIDEO+DC |
| AUDIO/VIDEO+DC | AUDIO/VIDEO+DC |
| INFRA | INFRA |
| FORTINET | FORTINET |
| MICROINFORMATICA | MICROINFORMATICA |

---

## Validation rules

A row is **skipped** if:
- Odd value is not one of the five supported values (0.10, 0.25, 0.50, 0.75, 1.00)
- Brand is not one of the five canonical brands
- TCV is missing or ≤ 0
- All quarter values sum to zero (weighted_total = 0)
- Allocation sum deviates from 1.0 by more than 0.001 after derivation

A row is **imported with a warning** if:
- `weighted_total` from the Excel deviates by more than 1% from `TCV × odd` — the actual Excel values are used as-is

---

## Data assumptions

- Stage label is derived from **Odd**, not from Status
- Status is used only to detect LOSS
- `client_name` is taken as-is from "Cliente - Proyecto" (no splitting)
- `project_name` is always `null` (not split from client column)
- `due_date` does not exist in the Excel; it is derived from the Quarter column
- LOSS rows have `odd = 0`; they receive `stage_label = LOSS` and `status_label = LOSS`
- LOSS rows receive `allocation_q1..q4 = 0` (excluded from all calculations via `status_label = LOSS`)
- Sellers and brands are created on demand if they don't already exist in the DB

---

## Known limitations

- **odd = 0.05** is not a supported stage value. Two rows in the current file use it and are skipped.
- **LOSS sheet column inconsistency**: rows 10–14 have an extra Quarter column not present in rows 1–9. This is handled by runtime detection.
- **Weighted value mismatches**: six rows in the current file have `weighted_total ≠ TCV × odd` (differences of 40–260%). These are imported using the actual Excel Q-values without correction.
- The year is hardcoded to `2026`. To import a different year, update the `YEAR` constant in the script.
- The script does not deduplicate transactions. Running without `--clear` will append rows on top of any existing data.
