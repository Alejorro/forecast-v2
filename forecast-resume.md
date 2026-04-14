# Forecast V2 — System Resume

> **Purpose of this document:** Complete reference for system logic, business rules, data model, functional flows, and backend behavior. Sufficient to understand the full system without reading any other file.

---

## 1. Product Overview

**Name:** DOT4 Forecast V2
**Type:** Internal commercial forecast management tool for DOT4.
**Problem solved:** Replaces an Excel-based workflow for commercial forecast tracking. The previous process was error-prone, hard to maintain, and lacked a structured operational view.

**Goals:**
- Replace the Excel workflow with a structured internal application
- Enable correct, auditable forecast calculations
- Support fast transaction entry, editing, and querying
- Provide clear operational dashboards for decision-making

**Users:** Claudio, the sales team, and management.

**Out of scope:** SaaS delivery, mobile, complex authentication, AI features, multi-currency.

---

## 2. System Scope

### Current capabilities
- Transaction management (create, edit, duplicate, soft-delete)
- Plan management (quarterly targets per brand)
- Forecast calculation (TCV × stage probability, distributed across quarters)
- Gap calculation (plan vs forecast)
- Excel import from `DATADOT.xlsx`
- Operational dashboards: Overview, Transactions, Plans, Brands, Sellers, Import/Audit

### Explicit boundaries
- Single currency: USD. No conversion logic, no multi-currency support.
- No authentication or multi-tenancy.
- No SaaS features.
- `status_label` is stored but does not affect calculations (reserved for future use).
- LOSS transactions are excluded from operational views by default but are never deleted — they remain in the database and can be toggled visible.

---

## 3. Functional Architecture

### Modules

| Module | Responsibility |
|---|---|
| Overview | Year-level forecast health across all brands |
| Transactions | Core operational CRUD screen |
| Plans | Quarterly revenue target management per brand |
| Brands | Brand-level forecast and pipeline analysis |
| Sellers | Seller contribution analysis |
| Import / Audit | Excel ingestion, validation, and commit |

### Tech stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Railway in production, local instance in dev)
- Architecture is intentionally simple. No microservices, no complex abstractions.

### Key principles from `CLAUDE.md`
- Keep architecture simple. Avoid overengineering.
- Do not invent business rules.
- Prioritize usability over visuals.
- `stage_percent` is derived, never stored.
- `status_label` does not affect calculations.

---

## 4. Core Logic & Business Rules

### Stage system

Stage is determined **exclusively** by `stage_label`. The associated probability (`stage_percent`) is **always derived at runtime** and never stored.

| stage_label | stage_percent |
|---|---|
| Identified | 0.10 |
| Proposal 25 | 0.25 |
| Proposal 50 | 0.50 |
| Proposal 75 | 0.75 |
| Won | 1.00 |

- If a `stage_label` is not one of these five values, the record must be **rejected** — during import, manual creation, and manual editing. No default value is assigned.

### Status system

`status_label` is stored for future use only. It does not affect any calculations today.

- Currently recognized value: `LOSS`
- `status_label` may be null.
- If a non-null, unrecognized value is provided, the record must be rejected during import, creation, or editing.
- LOSS transactions are excluded from operational views by default and included only when explicitly toggled.

### Forecast calculation

```
weighted_total = TCV × stage_percent
```

Per quarter:
```
qN_value = TCV × stage_percent × allocation_qN
         = weighted_total × allocation_qN
```

These values are **computed on read** and never stored.

### Quarter allocation rules

- `allocation_q1`, `allocation_q2`, `allocation_q3`, `allocation_q4` are stored as decimals between 0 and 1.
- Their sum must equal exactly `1.0`.
- Default case: one quarter gets `1.0`, the rest get `0`.
- Transactions may be split across any number of quarters.
- Tolerance for import validation: ±0.001.

### Q1-Q4 custom distribution

When a transaction is assigned to quarter `Q1-Q4`, the user can manually distribute the TCV across any combination of Q1–Q4. The UI shows individual USD amount inputs per quarter. Allocations are derived as `amount / TCV` before saving. The sum of all amounts must equal TCV.

Auto-balance rule (UX): if the sum is less than TCV by ≤ $999, the system auto-assigns the remainder to the last edited non-zero quarter (fallback: Q4 → Q3 → Q2 → Q1). If the difference exceeds $999, the user must adjust manually.

### Forecast scope

All forecast calculations are **scope-dependent**. Scope is defined by:
- Year (derived from `due_date`)
- Brand
- Quarter (when used in per-quarter context)

An in-scope transaction must:
1. Match the requested year (via `year(due_date)`)
2. Match the requested brand
3. Contribute to the requested quarter (allocation > 0 for that quarter)
4. Have `deleted_at = null` (not soft-deleted)

**Transactions without a `due_date` are excluded from plan-vs-gap calculations.**

### Quarter forecast definitions

For a given brand, year, and quarter:
```
qN_weighted_forecast = sum of qN_value across all in-scope transactions
```

For a given brand and year:
```
fy_forecast = q1_weighted_forecast + q2_weighted_forecast + q3_weighted_forecast + q4_weighted_forecast
```

**Important:** Transactions split across quarters may appear in multiple quarter views. Quarter totals must never be summed manually to avoid double-counting.

### Won logic

- `Won` = `stage_label = "Won"` (i.e., `stage_percent = 1.0`)
- Won transactions are **included** in the weighted forecast.
- Won is shown separately in dashboards only for additional visibility, not as an alternative metric.

### Gap calculation

```
gap = plan − weighted_forecast
```

- Positive gap: forecast is below plan (behind target).
- Negative gap: forecast exceeds plan.

Null handling:
- If no Plan row exists for a given brand/year: `gap = null`. Do not assume zero.
- If a Plan row exists but the relevant quarter plan value is `null`: `quarter_gap = null`.
- If a Plan row exists and the relevant quarter plan value is `0`: `quarter_gap = 0 − quarter_weighted_forecast`.

**Never invent fallback values. Silence is distinct from zero.**

### Plan definition

- Plan is defined per brand and per year.
- Each plan has quarterly targets: `q1_plan`, `q2_plan`, `q3_plan`, `q4_plan`.
- `fy_plan = q1_plan + q2_plan + q3_plan + q4_plan`
- If any quarter plan value is `null`, `fy_plan` must also be `null`. Null is not treated as zero.

---

## 5. Data Model (Conceptual)

### Brand
| Field | Notes |
|---|---|
| id | Primary key |
| name | Canonical brand name |

### Seller
| Field | Notes |
|---|---|
| id | Primary key |
| name | Seller name |

### Plan
| Field | Notes |
|---|---|
| id | Primary key |
| year | Fiscal year (integer) |
| brand_id | FK → Brand |
| q1_plan | Nullable USD value |
| q2_plan | Nullable USD value |
| q3_plan | Nullable USD value |
| q4_plan | Nullable USD value |

`fy_plan` is derived (never stored): `q1_plan + q2_plan + q3_plan + q4_plan`. Null if any quarter is null.

### Transaction
| Field | Notes |
|---|---|
| id | Primary key |
| client_name | Required |
| project_name | Optional (currently always null; not split from client_name) |
| seller_id | FK → Seller, required |
| brand_id | FK → Brand, required |
| sub_brand | Optional text, no business logic |
| vendor_name | Optional text, no business logic |
| opportunity_odoo | Optional reference |
| brand_opportunity_number | Optional reference |
| due_date | Date; year is derived from this field |
| stage_label | One of the 5 valid values; required |
| status_label | `LOSS` or null |
| tcv | USD value; required |
| allocation_q1 | 0–1; sum with others must equal 1.0 |
| allocation_q2 | 0–1 |
| allocation_q3 | 0–1 |
| allocation_q4 | 0–1 |
| description | Optional |
| invoice_number | Optional |
| notes | Optional |
| highlight_color | Optional; one of: `green`, `yellow`, `orange`, `red`; null = no highlight |
| transaction_type | Optional (TEXT); one of: `BAU`, `EXPAND`, `NEW CLIENT`; null for existing rows |
| created_at | Timestamp |
| updated_at | Timestamp |
| deleted_at | Nullable; soft delete marker |

**Critical modeling rules:**
- Do NOT store `stage_percent`.
- Do NOT store `q1_value` through `q4_value` (derived on read).
- Do NOT store `weighted_total` (derived on read).
- Only store inputs, never derived values.

### Soft delete behavior
- Transactions with `deleted_at IS NOT NULL` must be excluded from all operational calculations and active views.
- They are not physically deleted from the database.

---

## 6. Functional Flows

### Transaction creation
1. User opens the transaction drawer (from Transactions screen or Overview top opportunities).
2. Fills in: Client (required), Brand (required), Seller (required), TCV (required), Stage (required), optionally Status, Year (defaults to global year), Q1–Q4 allocations (must sum to 1.0), optionally Notes.
3. System validates allocations in real time. If sum ≠ 1.0, inline error is shown (no auto-correct).
4. On save: transaction is written to DB; weighted and quarter values are never persisted.

### Transaction editing
- Opens the same drawer pre-filled.
- Same validation rules apply.
- No confirmation dialog for edits.

### Transaction duplication
- Copies all fields into a new drawer for the user to adjust before saving.

### Soft delete
- User triggers delete → confirm dialog shown.
- On confirm: `deleted_at` is set to current timestamp.
- Transaction is excluded from all calculations and active views immediately.

### Plan editing
- Plans table has one row per brand with inline-editable quarterly cells.
- Changed cells are highlighted until saved.
- Single "Save all changes" button commits all pending edits at once.

### Excel import flow
1. User uploads `DATADOT.xlsx` (drag/drop or file picker).
2. System previews column mapping and first 20 rows of raw data.
3. Validation runs: per-row errors reported (row number, field, reason).
4. Comparison summary shows before/after totals for the same year/brand.
5. User triggers "Import valid rows" — system skips rows with errors, shows count confirmation before committing.
6. User can download a CSV error report.

---

## 7. UX — Functional Perspective

### Global state
- A **global year selector** appears in the top navigation and scopes all screens simultaneously, without page reload.

### Navigation
The app has six screens accessible via top navigation:
- **Overview** (default landing)
- **Transactions** (primary operational screen)
- **Plans** (target management)
- **Brands** (brand-level analysis)
- **Sellers** (seller-level analysis)
- **Import / Audit** (data ingestion)

### Key behavioral rules
- Forms always open as right-side drawers. Users never navigate away from the list context.
- No confirmation dialogs for edits; confirmation required only for soft-delete.
- LOSS transactions are hidden in operational views by default. A toggle exposes them — they are never deleted.
- Quarter allocations are always visible in the transaction form (not hidden in a tab).
- Null gaps display as "No plan" or blank — never as zero.

### Keyboard behavior
- Tab through fields, Enter to save, Escape to close.

### Screen: Overview
- Scope: one selected year, all brands combined.
- Displays: Total Plan, Total Weighted Forecast, Total Won, Total Gap (with Q1–Q4 breakdown per KPI card).
- Charts: Plan vs Forecast vs Won by quarter; Gap by brand; Pipeline by stage.
- Top 5 Active Opportunities: transactions that are not Won, not LOSS, and not soft-deleted, ranked by `weighted_total`. Clicking a row opens the edit drawer.
- LOSS transactions are excluded from all charts by default.

### Screen: Transactions
- Filter bar: search by client, brand, seller, stage, quarter, LOSS toggle, "Clear filters".
- Quarter filter rule: show transactions where `allocation > 0` for the selected quarter.
- Toolbar: transaction count label + "New Transaction" button.
- Table columns: Client, Brand, Seller, TCV, Stage, Weighted Value, Q1/Q2/Q3/Q4 per-quarter weighted values (blank if allocation = 0), Status (visible only when LOSS toggle is on), Actions (edit/duplicate/delete).

### Screen: Plans
- One row per brand, inline-editable quarterly plan cells.
- Derived columns: FY Plan (computed), FY Weighted Forecast (from transactions), FY Gap.
- Pinned totals row at the bottom.

### Screen: Brands
- Brand selector as a horizontal tab row.
- Per-brand: KPI cards (Plan, Weighted Forecast, Won, Gap), Quarterly Breakdown table, Pipeline by Stage chart, Top 10 Transactions with "Show all" link pre-filtered to that brand.

### Screen: Sellers
- Summary table ranked by Weighted Forecast (descending by default).
- Columns: Seller, Deal Count (active transactions), TCV Total, Weighted Forecast, Won, Contribution %.
- Click a seller row to expand inline and see that seller's transactions (Client, Brand, Stage, TCV, Weighted).
- Totals footer row pinned at the bottom.

### Screen: Import / Audit
- Upload zone (drag/drop or file picker for `.xlsx`).
- Column mapping preview, data preview (first 20 rows), validation results, comparison summary, import action with confirmation.

---

## 8. Backend Interaction

### Data flow
- All monetary derived values (`weighted_total`, `qN_value`) are computed on read by the backend.
- The frontend receives pre-computed values for display — it does not perform forecast calculations.
- Plan and transaction writes are validated server-side against business rules.

### Excel import (backend script)
Script: `backend/scripts/import-datadot.js`
Source file: `DATADOT.xlsx`

**Run commands:**
```bash
# Standard import (idempotent — upserts plans, appends transactions)
node scripts/import-datadot.js DATADOT.xlsx

# Preview only — no DB writes
node scripts/import-datadot.js DATADOT.xlsx --dry-run

# Wipe all plans and transactions, then reimport
node scripts/import-datadot.js DATADOT.xlsx --clear
```

**Excel structure parsed:**
- Sheet `"PLAN 2026"` — top section (rows 2–6): one row per brand, columns [0] brand, [6–9] Q1–Q4 plan values.
- Sheet `"PLAN 2026"` — main section (row 21+): transaction rows.
- Sheet `"LOSS"` — LOSS transactions (separate sheet with a known column inconsistency handled at runtime).

**Transaction column mapping from Excel:**

| Column index | Excel field | Internal field |
|---|---|---|
| [0] | Cliente - Proyecto | `client_name` |
| [1] | Quarter | used to derive `due_date` |
| [2] | Oportunidad en ODOO | `opportunity_odoo` |
| [3] | Nro de oportunidad en la marca | `brand_opportunity_number` |
| [5] | Vendedor | `seller_name` |
| [6] | Brand | `brand_name` |
| [7] | Sub-brand | `sub_brand` |
| [8] | Marca | `vendor_name` |
| [9] | Status | `status_label` (LOSS detection only) |
| [13] | Odd | `stage_label` (via mapping) |
| [14] | TCV | `tcv` |
| [15–18] | Q1–Q4 weighted values | used to derive `allocation_q1–q4` |
| [22] | Descripcion | `notes` |
| [23] | Nro de Factura | `invoice_number` |

**Odd → stage_label mapping:**

| Odd | stage_label |
|---|---|
| 0.10 | Identified |
| 0.25 | Proposal 25 |
| 0.50 | Proposal 50 |
| 0.75 | Proposal 75 |
| 1.00 | Won |

**Quarter → due_date mapping:**

| Quarter value | due_date |
|---|---|
| 1Q | 2026-03-31 |
| 2Q | 2026-06-30 |
| 3Q | 2026-09-30 |
| 4Q | 2026-12-31 |
| (absent) | null |

**Allocation derivation from Excel:**
Excel stores weighted values per quarter. Allocations are derived as:
```
weighted_total = q1 + q2 + q3 + q4
allocation_qN  = qN / weighted_total
```
Allocation sum must equal 1.0 (±0.001 tolerance). Rows where all quarter values are zero are skipped.

**Brand normalization:**

| Excel name | Canonical name |
|---|---|
| NETWORKING/PRINTERS | NETWORKING |
| AUDIO/VIDEO + DC | AUDIO/VIDEO+DC |
| AUDIO/VIDEO+DC | AUDIO/VIDEO+DC |
| INFRA | INFRA |
| FORTINET | FORTINET |
| MICROINFORMATICA | MICROINFORMATICA |

**Import skip conditions:**
- Odd value not in the five supported values
- Brand not in the five canonical brands
- TCV missing or ≤ 0
- All quarter values sum to zero
- Allocation sum deviates from 1.0 by more than 0.001

**Import warning condition:**
- `weighted_total` from Excel deviates by more than 1% from `TCV × odd` — imported as-is using actual Excel values.

**LOSS rows:** Always have `odd = 0`. The script assigns `stage_label = Identified` as a schema-required placeholder. LOSS rows receive `allocation_q1..q4 = 0` since they are excluded from all calculations.

---

## 9. System Behavior

### Soft delete
- Physically retained in the database.
- Excluded from all calculations and operational views via `deleted_at IS NOT NULL` filter.
- Can only be recovered by direct DB intervention (no UI undelete).

### LOSS handling
- LOSS transactions are filtered out of operational views by default.
- They do not affect any forecast, gap, or pipeline calculation.
- They can be toggled visible via a UI filter.
- They are treated as archived/closed-lost records.

### Null vs zero
- `null` and `0` are semantically distinct throughout the system.
- A null plan means "no target defined" — do not compute a gap.
- A zero plan means "target is zero" — gap = 0 − forecast (which may be negative).

### Transaction year
- Year is derived from `year(due_date)`.
- Transactions without a `due_date` are excluded from plan-vs-gap calculations.

### Import idempotency
- Standard import upserts plans and appends transactions (does not deduplicate).
- `--clear` wipes plans and transactions before importing.
- The import year is hardcoded to 2026. To change it, update the `YEAR` constant in the script.

---

## 10. Technical Decisions

| Decision | Rationale |
|---|---|
| PostgreSQL as database | Migrated from SQLite on 2026-04-08 for production deployment on Railway |
| Node + Express backend | Lightweight, sufficient for this scope |
| React + Vite + Tailwind frontend | Standard modern stack; no complex state management needed for this scale |
| Derived values never stored | Prevents data inconsistency between inputs and computed results |
| Soft delete (not physical) | Preserves audit trail; LOSS transactions remain queryable |
| Right-side drawers for forms | User never loses list context during editing |
| Global year selector | Scopes all screens consistently; eliminates per-screen year confusion |

---

## 11. Assumptions & Constraints

- Single currency: USD. No conversion or multi-currency logic.
- Simple session-based auth is implemented (see Section 19). No OAuth, JWT, or external identity providers.
- `project_name` is always null. The Excel stores client and project as a combined string; no splitting is implemented.
- Sellers and brands are created on demand during import if not already present.
- The import year is hardcoded to 2026 in the import script.
- The five canonical brands are the only valid brands. All others are rejected during import.

### Year rollover (e.g. 2026 → 2027)

No schema changes or new tables are required. The system already supports multiple years natively.

To start a new year:
1. Go to **Plans** and enter the targets for the new year per brand.
2. Switch the global year selector to the new year.
3. New transactions with `due_date` in the new year appear automatically in the new year scope.

Prior year data remains intact and accessible by switching the year selector back.

The only manual step required in code: update the `YEAR` constant in `backend/scripts/import-datadot.js` if the Excel import script is used for the new year.

With Odoo integration active, year scoping is automatic — transactions use `due_date` derived from `crm.lead.date_deadline`, so 2027 opportunities appear in 2027 scope without any intervention.

---

## 12. Known Limitations & Open Issues

### Import script
- `odd = 0.05` is not a supported stage value. Two rows in the current Excel file use it and are skipped.
- **LOSS sheet column inconsistency:** rows 10–14 have an extra Quarter column not present in rows 1–9. This is handled by runtime detection.
- **Weighted value mismatches:** six rows in the current file have `weighted_total ≠ TCV × odd` (differences of 40–260%). These are imported using actual Excel Q-values without correction.
- Import does not deduplicate transactions. Running without `--clear` appends rows on top of existing data.

### Project phase
As of 2026-04-10 the app is live in production. Core backend and frontend are complete. Remaining pending items are in Section 14.

### Deployment
- The database lives on Railway (PostgreSQL). It is not in the repository.
- Local dev uses a separate `forecast_dev` PostgreSQL database (see Section 16).
- No database files should be committed to version control.

---

## 14. Implementation State

> Last updated: 2026-04-10

### What is built

**Backend:**
- [x] PostgreSQL schema (`backend/schema.sql`, `backend/db.js` — pg pool)
- [x] Transaction CRUD endpoints (GET list, GET by id, POST, PUT, DELETE soft, POST duplicate)
- [x] Plan endpoints (GET all, GET by brand, PUT upsert)
- [x] Brands endpoint (GET)
- [x] Sellers endpoint (GET)
- [x] Overview/summary endpoints
- [x] Validation rules (stage_label, allocations sum, due_date)
- [x] Excel import script (`backend/scripts/import-datadot.js`)
- [x] Auth system (`backend/auth/users.js`, `backend/middleware/auth.js`, `backend/routes/auth.js`)
- [x] `/health` endpoint
- [x] CORS configured for production (`https://forecast.dot4sa.com.ar`)
- [x] Session cookies configured for cross-origin production use (`sameSite: none`, `secure: true`)
- [x] `trust proxy` fix — `app.set('trust proxy', 1)` in `server.js` (required for Railway reverse proxy + secure cookies, commit `92904de`)
- [x] SQLite → PostgreSQL migration script (`backend/scripts/migrate-sqlite-to-pg.js`)
- [x] `highlight_color` field on transactions (`TEXT`, nullable, values: `green/yellow/orange/red`)
- [x] Migration script for `highlight_color` column (`backend/scripts/migrate-add-highlight-color.js`)
- [x] `transaction_type` field on transactions (`TEXT`, nullable, values: `BAU/EXPAND/NEW CLIENT`); added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `schema.sql`

**Frontend:**
- [x] Login screen with `credentials: 'include'`
- [x] `VITE_API_URL` env var support in `frontend/src/utils/api.js`
- [x] Q1-Q4 custom distribution UI — per-quarter USD amount inputs with auto-balance logic
- [x] Naming unified: `1Q-4Q` → `Q1-Q4` throughout frontend and `backend/lib/forecast.js`
- [x] Highlight color field in transaction drawer — toggle dots (green/yellow/orange/red, click to select/deselect)
- [x] Transaction row highlight — colored background based on `highlight_color` (overrides striping, not LOSS rows)

**Deployment (completed 2026-04-08):**
- [x] App live at `https://forecast.dot4sa.com.ar`
- [x] Backend on Railway (`https://forecast-v2-production.up.railway.app`)
- [x] Frontend on Vercel (`https://forecast-v2-khaki.vercel.app`)
- [x] DNS configured via Ferozo (CNAME records for both subdomains)
- [x] PostgreSQL on Railway, 308 transactions migrated
- [x] Local dev environment set up (PostgreSQL@16 local + `dev` branch)
- [x] `NODE_ENV=production` set in Railway env vars (required for cross-origin secure cookies)

### What is pending

- [ ] Excel import endpoint (UI-triggered via API, not just CLI script)
- [ ] `api.dot4sa.com.ar` DNS full propagation + SSL activation (Railway custom domain)
- [ ] Run `highlight_color` DB migration against Railway production: `DATABASE_URL=<railway-url> node backend/scripts/migrate-add-highlight-color.js`
- [ ] Merge `dev` branch to `main` (contains: Q1-Q4 UI, highlight_color, modal layout, Q1-Q4 naming rename)

---

## 15. Project Structure

> **Note:** Placeholder. Fill in the actual directory tree once confirmed.

```
forecast-v2/
├── backend/
│   ├── scripts/
│   │   └── import-datadot.js     # Excel import script
│   ├── (routes, controllers, db — to be documented)
│   └── package.json
├── frontend/
│   └── src/
│       └── (components, pages — to be documented)
├── docs/                          # Original source docs (superseded by this file)
├── forecast-resume.md
├── forecast-frontend.md
└── CLAUDE.md
```

---

## 16. How to Run

### Local development (every session)

Requires 3 terminal tabs open simultaneously:

**Tab 1 — PostgreSQL** (stays open):
```bash
/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16
```

**Tab 2 — Backend** (stays open):
```bash
cd /Users/kurai/Desktop/forecast-v2/backend
DATABASE_URL=postgresql://localhost/forecast_dev npm run dev
# Runs on port 3001
```

**Tab 3 — Frontend** (stays open):
```bash
cd /Users/kurai/Desktop/forecast-v2/frontend
npm run dev
# Runs on port 5173
```

Open `http://localhost:5173` in the browser.

### First-time local setup

```bash
# Install and start PostgreSQL
brew install postgresql@16
/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16  # in one tab
createdb forecast_dev  # in another tab

# Create dev branch
cd /Users/kurai/Desktop/forecast-v2
git checkout -b dev

# Populate local DB with production data (from SQLite backup)
cd backend
DATABASE_URL=postgresql://localhost/forecast_dev node scripts/migrate-sqlite-to-pg.js
```

### Import Excel data (local)
```bash
cd backend
DATABASE_URL=postgresql://localhost/forecast_dev node scripts/import-datadot.js DATADOT.xlsx
```

### Dev → Production workflow

```bash
# Work on dev branch, commit freely
git add <files>
git commit -m "description"

# When ready to go to production
git checkout main
git merge dev
git push   # Railway and Vercel auto-deploy on push to main
git checkout dev
```

---

## 17. API Endpoints

All routes are prefixed with `/api`. Backend runs on port `3001`.

### Auth
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Login with `{ username, password }`. Returns `{ role, sellerCode, sellerName }` |
| POST | `/auth/guest` | public | Start a read-only guest session |
| POST | `/auth/logout` | any | Destroy session |
| GET  | `/auth/me` | any | Return current session user |

### Transactions
| Method | Route | Access | Description |
|---|---|---|---|
| GET    | `/transactions` | open | List transactions. Filters: `year`, `brand_id`, `seller_id`, `stage_label`, `quarter`, `include_loss`, `search` |
| GET    | `/transactions/:id` | open | Get single transaction |
| POST   | `/transactions` | admin, seller | Create transaction. Seller: `seller_id` must match own identity |
| PUT    | `/transactions/:id` | admin only | Edit transaction |
| DELETE | `/transactions/:id` | admin only | Soft delete |
| POST   | `/transactions/:id/duplicate` | admin, seller | Duplicate. Seller: can only duplicate own transactions |

### Plans
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/plans` | open | All brands with plan + forecast + gap for a year. Query: `?year=YYYY` |
| GET | `/plans/:brand_id` | open | Single brand plan detail. Query: `?year=YYYY` |
| PUT | `/plans/:brand_id` | admin only | Upsert plan. Body: `{ year, q1_plan, q2_plan, q3_plan, q4_plan }` |

### Brands / Sellers / Overview
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/brands` | open | All brands |
| GET | `/sellers` | open | All sellers |
| GET | `/overview` | open | Year-level forecast summary. Query: `?year=YYYY` |
| GET | `/brands/:id/summary` | open | Brand-level summary |
| GET | `/sellers/summary` | open | Seller contribution summary |

### Auth model summary
- **Admin:** full access to all routes
- **Seller:** read all + create/duplicate own transactions only
- **Guest:** read-only (all GET endpoints)
- Authentication: session cookie (`dot4.sid`), 8-hour expiry

---

## 19. Auth System

Implemented as simple session-based auth. No JWT, no OAuth, no external providers.

### Roles
| Role | How to access | Permissions |
|---|---|---|
| admin | username: `Admin`, password: `alejocapo` | Full access |
| seller | username: seller code, password: code + `123` | Read all + create/duplicate own transactions |
| guest | POST `/api/auth/guest` (no credentials) | Read only |

### Seller accounts
| Code | Name | Password |
|---|---|---|
| CB | Christian Braun | CB123 |
| MG | Milton Gallo | MG123 |
| CL | Carlos Lopez | CL123 |
| MV | Mathias Villamayor | MV123 |
| MB | Mariano Basso | MB123 |
| FVI | Fabio Villamayor | FVI123 |
| FV | Florencia Vargas | FV123 |
| NC | NEW CLIENT | NC123 |
| OO | Oscar Ontano | OO123 |
| AS | Alejandro Simeone | AS123 |
| ST | Sandra Tedesco | ST123 |
| BZ | Brian Zino | BZ123 |
| CF | Carlos Furnkorn | CF123 |
| CG | Claudio Guerra | CG123 |
| JCR | Juan Carlos Romitelli | JCR123 |

Login is case-insensitive for both username and password.

### Key files
- `backend/auth/users.js` — hardcoded user registry and `findUser()`
- `backend/middleware/auth.js` — `attachUser`, `requireAdmin`, `requireWrite`
- `backend/routes/auth.js` — login, guest, logout, me endpoints

### Seller identity enforcement
When a seller creates or duplicates a transaction, the backend looks up their `seller_id` from the `sellers` table via `name_normalized` and rejects any request where `seller_id` doesn't match.

---

## 18. Database Schema (SQL)

> **Note:** Placeholder. Paste the actual `CREATE TABLE` statements once confirmed. The conceptual model is in Section 5.

```sql
-- To be filled in
```

---

## 13. Consolidated Rules from CLAUDE.md

- Forecast is based on TCV weighted by stage probability.
- Stage is defined **only** by `stage_label`. `stage_percent` is derived, never stored.
- Transactions can be assigned to one or multiple quarters.
- `status_label` is stored for future use only. It does not affect calculations now.
- Plan is defined by brand and quarter.
- The system uses a single currency: USD.
- Keep architecture simple. Avoid overengineering.
- Do not invent business rules.
- If something is unclear, ask before implementing.
- Prioritize usability over visuals.
- Keep code simple. Avoid unnecessary abstractions.
