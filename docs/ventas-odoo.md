# Ventas — Odoo Sales Integration

## What it does

Imports `sale.order` records from Odoo into a local `sales_odoo` table.
Converts all amounts to USD oficial at the rate of the sale date.
Exposes a read-only view with editable internal fields.

**Completely separate from `transactions`. No shared logic, no shared tables.**

---

## Files

| File | Role |
|---|---|
| `backend/routes/ventas.js` | All API routes + sync logic |
| `backend/lib/odoo-client.js` | Odoo JSON-RPC client (auth + search_read) |
| `backend/schema.sql` | `sales_odoo`, `fx_rates` tables; `odoo_user_id` on sellers |
| `frontend/src/pages/VentasPage.jsx` | Main page (seller selector, KPIs, brand summary, filters, table) |
| `frontend/src/components/VentasDrawer.jsx` | Right-side drawer (read-only Odoo data + editable internal fields) |
| `backend/scripts/inspect-odoo-sales.js` | One-shot debug script — prints all `sale.order` fields + sample record |

---

## API Routes (`/api/ventas`)

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/ventas` | open | List. Filters: `year`, `brand`, `seller_id`, `invoice_status`, `search` |
| GET | `/ventas/sellers` | open | Distinct sellers that have at least one sale in `sales_odoo` |
| GET | `/ventas/brands` | open | Distinct brands in `sales_odoo` |
| GET | `/ventas/:id` | open | Single sale |
| PATCH | `/ventas/:id` | admin, manager | Update internal fields only: `notes`, `provider`, `internal_tags`, `highlight_color` |
| POST | `/ventas/sync` | admin, manager | Trigger full Odoo sync. Returns `{ fetched, upserted, failed, warnings }` |
| GET | `/ventas/fx-rates` | admin, manager | List recent FX rates (for debugging) |
| POST | `/ventas/fx-rates` | admin, manager | Manual upsert of a rate. Body: `{ rate_date, currency, rate }` |

---

## Odoo Connection

**Env vars** (in `backend/.env`):
```
ODOO_URL=https://odoo.dot4sa.com
ODOO_DB=dot4-prod
ODOO_USER=alejo.palladino@dot4sa.com
ODOO_PASSWORD=...
ODOO_COMPANY_ID=1
```

**Client** (`backend/lib/odoo-client.js`):
- Uses Odoo JSON-RPC via `/web/session/authenticate` + `/web/dataset/call_kw`
- Native Node `fetch` — no extra packages needed
- `createOdooClient()` reads the env vars above

---

## Sync Logic (`POST /api/ventas/sync` + autosync)

Two steps, same pattern as PriceChecker (`sync_odoo.py`):

### Step 1 — Sync currency rates
Fetches all records from `res.currency.rate` in Odoo and upserts into `fx_rates`.
This is the authoritative source of historical rates — no manual rate entry needed.

```
fx_rates schema:
  rate_date  DATE    — date of the rate
  currency   TEXT    — Odoo currency name: "USD", "US$", "PES", etc.
  rate       REAL    — 1 ARS = rate [currency]  (Odoo convention)
```

Example values:
- `currency="USD"  rate=0.000909` → 1 ARS = 0.000909 USD → 1 USD ≈ 1100 ARS
- `currency="US$"  rate=0.00083`  → 1 ARS = 0.00083 US$ → 1 US$ ≈ 1205 ARS

### Step 2 — Fetch sale orders
Filter: `state IN ('draft', 'sent', 'sale', 'done')`. Fetches all matching rows using paginated `search_read` batches.
This includes confirmed orders (invoiced + to invoice) **and quotations** (draft/sent).

Automatic sync is supported by backend env vars:

```text
VENTAS_AUTO_SYNC_ENABLED=true|false
VENTAS_AUTO_SYNC_INTERVAL_MS=3600000
VENTAS_AUTO_SYNC_ON_START=true|false
```

In production, autosync defaults to enabled, runs once shortly after startup, and repeats every hour unless overridden.

### Stale handling

The sync never deletes `sales_odoo` rows. Each successful sync marks rows seen in Odoo as `is_active = true` and clears `stale_at`. Existing rows not returned by the current Odoo query are marked `is_active = false` with `stale_at = sync time`.

Ventas list, KPIs, seller options, and brand options use only active rows by default. `include_stale=true` can be used for debugging historical/stale rows.

**Fields fetched from `sale.order`:**
- `id`, `name` → `odoo_sale_order_id`, `reference`
- `partner_id` → `client_name`
- `user_id` → `seller_name_raw` + seller mapping
- `brand_id` → `brand` (custom DOT4 field — NOT `team_id`)
- `state` → `order_state` (`draft`, `sent`, `sale`, `done`)
- `invoice_status` → `invoice_status`
- `date_order` → `sale_date`, `quarter`, `year`
- `currency_id` → `currency_original`
- `amount_total` → `amount_original`

**Domain:**
- `state IN ('draft', 'sent', 'sale', 'done')`
- `company_id = ODOO_COMPANY_ID` (defaults to `1`, DOT4 SA)

**Important field discoveries (from inspect script run 2026-04-22):**
- Brand comes from `brand_id` (custom field), NOT `team_id` (which is always "Sales")
- There are two seller fields: `user_id` (full name, e.g. "CHRISTIAN BRAUN") and `seller_id` (code format, e.g. "01.CBRAUN"). We use `user_id` for name-based mapping.

---

## Currency Conversion

Port of `convert_to_usd` from PriceChecker's `sync_odoo.py`. Computed at sync time, stored in `amount_usd_official`.

```
Case A — currency == "USD"
  → usd = amount  (1:1, no conversion)

Case B — currency == "PES"
  → rate_usd = get_rate("USD", sale_date)
  → usd = amount * rate_usd

Case C — currency == "US$"  (dólar billete / blue)
  → rate_usdd = get_rate("US$", sale_date)
  → rate_usd  = get_rate("USD", sale_date)
  → ars = amount / rate_usdd
  → usd = ars * rate_usd
```

`get_rate` always uses the most recent rate <= sale_date (never a future rate).
`fx_rate_date_used` stores the actual rate date returned by `get_rate`, which may be earlier than `sale_date`.
If a required rate is missing, `amount_usd_official` is stored as `null` and a warning is logged.

**Verified 2026-04-22:** Cross-checked USD totals against Odoo CSV export. Difference was $0.07 (rounding only). Logic is correct.

---

## Seller Mapping

All sellers have been mapped to their Odoo user IDs. The `odoo_user_id` column is set on all active sellers, so matching is exact (no fallback needed in practice).

Mapping priority:
1. `sellers.odoo_user_id = order.user_id[0]` (Odoo numeric user ID) — primary
2. Normalize `order.user_id[1]` (name) → match `sellers.name_normalized` — fallback
3. No match → `seller_id = null`, warning logged

**Current seller → Odoo ID mappings (set 2026-04-22):**

| Seller | Odoo user_id |
|---|---|
| Alejandro Simeone | 35 |
| Brian Zino | 37 |
| Christian Braun | 38 |
| Claudio Guerra | 39 |
| Fabio Villamayor | 42 |
| Carlos Furnkorn | 45 |
| Milton Gallo | 47 |
| Carlos Lopez | 49 |
| Mariano Basso | 62 |
| Oscar Ontano | 55 |
| Juan Carlos Romitelli | 57 |
| Sandra Tedesco | 59 |
| Florencia Vargas | 60 |
| Mathias Villamayor | 61 |
| Juan Manuel Basso | 36 |
| Gabriel Acosta | 34 |
| Franco Nicora | 52 |

Sellers without match (logged as warnings): `FACTURACION` (uid=43) — generic billing user, not a real seller.

---

## Database Tables

### `sales_odoo`
| Column | Notes |
|---|---|
| `odoo_sale_order_id` | PK from Odoo — used for upsert |
| `reference` | e.g. "S01210" |
| `client_name` | `partner_id[1]` |
| `seller_id` | FK → sellers (nullable if no match) |
| `seller_name_raw` | `user_id[1]` as-is from Odoo |
| `brand` | `brand_id[1]` |
| `invoice_status` | `"to invoice"`, `"invoiced"`, or `"nothing"` |
| `order_state` | `"draft"`, `"sent"`, `"sale"`, `"done"` — from Odoo `state` field |
| `sale_date` | Date part of `date_order` |
| `quarter` | Derived: Q1/Q2/Q3/Q4 from `sale_date` |
| `year` | Derived from `sale_date` |
| `currency_original` | e.g. `"US$"`, `"PES"`, `"USD"` |
| `amount_original` | `amount_total` from Odoo |
| `amount_usd_official` | Computed at sync time (null if rate missing) |
| `fx_rate_used` | Rate value used for conversion |
| `fx_rate_date_used` | Actual date of the FX rate used (most recent rate <= `sale_date`) |
| `last_sync_at` | Timestamp of last sync |
| `notes` | Editable |
| `provider` | Editable |
| `internal_tags` | Editable |
| `highlight_color` | Editable — `green/yellow/orange/red` |
| `is_active` | `true` if the order was returned by the latest successful sync |
| `stale_at` | Timestamp when a previously synced order stopped appearing in Odoo's active query |

### `fx_rates`
Populated automatically by sync. Column is `rate` (1 ARS = rate [currency]).
Manual upsert available via `POST /api/ventas/fx-rates`.

### `sellers.odoo_user_id`
Nullable integer. Populated for all active sellers. Enables exact Odoo→seller matching without name normalization.

---

## Frontend

**Nav:** "Ventas" tab — visible to **manager only**. Hidden from sellers and admins.

**VentasPage layout:**
1. Title + seller dropdown (top-level, like Performance — "Todos" shows full company)
2. KPI cards: Total Empresa, Total Facturado, Total por Facturar, Cotizado
3. Brand summary table (computed client-side from filtered data)
4. Filter bar + Sincronizar Odoo button (same container): search, brand, invoice status
5. Main sales table

**KPI logic:**
- `Total Empresa` = orders where `order_state IN ('sale', 'done')`
- `Total Facturado` = `invoice_status = 'invoiced'`
- `Total por Facturar` = `invoice_status = 'to invoice'`
- `Cotizado` = orders where `order_state IN ('draft', 'sent')`

**Filter dropdowns (sellers and brands):**
Both load from dedicated endpoints (`/ventas/sellers`, `/ventas/brands`) on mount — independent of active filters. This prevents the bug where selecting a value collapses the dropdown to only that option.

**VentasDrawer:**
- Section A (read-only): all Odoo sync data
- Section B (editable): notes, provider, internal_tags, highlight_color
- Save calls `PATCH /api/ventas/:id`

---

## Data Verification (2026-04-22)

Cross-checked full Odoo CSV export (997 rows, 996 unique orders) against DB:

| Currency | CSV orders | DB orders | Amount match |
|---|---|---|---|
| USD | 164 | 164 | ✅ ($0.07 rounding) |
| US$ | 493 | 500 | 7 extra in DB (changed status after export) |
| PES | 177 | 187 | 10 extra in DB (changed status after export) |

The 17 orders in DB but not in CSV are real orders that were synced when their status was `to invoice`/`invoiced` but later changed to `nothing` in Odoo. The sync does not delete records — they remain in DB with the last known status.

---

## Debug Script

```bash
cd backend
node --env-file=.env scripts/inspect-odoo-sales.js
```

Prints all `sale.order` fields with types, then dumps one real record with non-empty values. Useful to verify field names after Odoo updates.
