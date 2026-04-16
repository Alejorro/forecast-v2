# Odoo Integration — Reference Document

> **Status:** Planning phase. Implementation not started.
> **Last updated:** 2026-04-13

---

## 1. Objective

Integrate Odoo with Forecast so that:
- Odoo is the **data input source** (CRM + Sales)
- Forecast is the **analysis, projection, and commercial tracking layer**

Odoo owns the operational side. Forecast owns the analytical/commercial side.

---

## 2. Core Principles

- Odoo is the source of truth for operational fields.
- Forecast is the source of truth for analytical fields.
- No duplicate record concepts: Odoo-synced records are stored in the existing `transactions` table.
- "Deal" is a business/conceptual term only. In the system, records remain **transactions**.
- Existing manual transactions are never touched by sync.

---

## 3. Architecture

### Data sources

| Source | Model | Used for |
|---|---|---|
| Odoo CRM | `crm.lead` | Opportunities, stage, TCV, seller, client, brand |
| Odoo Sales | `sale.order` | Quotations, invoice status, real amount |

### Relationship

- 1 CRM opportunity = 1 Forecast transaction
- No multiple transactions per quotation
- No transactions per product line
- Multiple opportunities per client = multiple transactions

---

## 4. Full Flow

### Stage 1 — CRM (crm.lead)
Salesperson creates an opportunity and fills in:
- Client (`partner_id`)
- Seller (`user_id`)
- Brand (`x_brand`)
- Subbrand (`x_subbrand`)
- Provider (`x_provider`)
- TCV (`expected_revenue`)
- Expected date (`date_deadline`)
- Stage forecast (`x_stage_forecast`: 10 / 25 / 50)
- Description (`x_description`)

Forecast creates or updates the transaction on next sync.

### Stage 2 — Sales (sale.order)
A quotation is created from the opportunity (`opportunity_id` required).
Forecast does **not** create a new transaction — it updates the existing one.

### Stage 3 — Operational closing
- `invoice_status = "to invoice"` → stage forced to 75% (Proposal 75)
- `invoice_status = "invoiced"` → stage forced to 100% (Won)
- Amount switches to `sale.order.amount_total`

---

## 5. Stage Rules

### From CRM (`x_stage_forecast`)
| Odoo value | stage_label |
|---|---|
| 10 | Identified |
| 25 | Proposal 25 |
| 50 | Proposal 50 |

CRM-sourced transactions only allow these three stages.

### From Sales (`invoice_status`)
| invoice_status | stage_label |
|---|---|
| `to invoice` | Proposal 75 |
| `invoiced` | Won |

These override CRM stage and are not manually editable.

---

## 6. Amount Rules

The existing `tcv` field remains the main field used in all forecast calculations.

Two reference fields are added:
- `amount_odoo` — TCV from `crm.lead.expected_revenue`
- `amount_sales` — real amount from `sale.order.amount_total`

### Resolution rule (applied during sync)
```
if amount_sales exists (invoice_status = "to invoice" or "invoiced"):
    tcv = amount_sales
else:
    tcv = amount_odoo
```

`tcv` is always what the system uses for weighted forecast calculations. `amount_odoo` and `amount_sales` are reference/audit fields only.

The amount switch happens **only** when `invoice_status` reaches `to invoice` or `invoiced`. A linked quotation alone does not trigger the switch.

---

## 7. Multiple Sale Orders per Opportunity

When an opportunity has more than one `sale.order`, use this priority:

1. If any order has `invoice_status = "invoiced"` → use that one
2. Else if any has `invoice_status = "to invoice"` → use that one
3. Else → use the most recent by `date_order`

Always map exactly one sale order to the transaction. Never create duplicate transactions.

---

## 8. LOSS Handling

Lost opportunities in Odoo (`active = false` on `crm.lead`) → set `status_label = 'LOSS'` in Forecast.

Uses the existing LOSS mechanism. LOSS transactions are hidden by default in all views.

---

## 9. Field Ownership

### Owned by Odoo (sync overwrites these)
- `client_name` (from `partner_id`)
- `seller_id` (from `user_id`)
- `brand_id` (from `x_brand`)
- `sub_brand` (from `x_subbrand`)
- `vendor_name` (from `x_provider`)
- `amount_odoo` (from `expected_revenue`)
- `amount_sales` (from `sale.order.amount_total`)
- `tcv` (resolved from amount rules above)
- `due_date` (from `date_deadline`)
- `invoice_status` (from `sale.order.invoice_status`)
- `stage_label` (derived from `x_stage_forecast` + `invoice_status`)
- `status_label` (derived from `active`)
- `description` (from `x_description`)
- `odoo_opportunity_id` (internal sync key, hidden)
- `odoo_sale_order_id` (internal sync key, hidden)
- `last_sync_at`

### Owned by Forecast (never overwritten by sync)
- `quarter` (allocation fields: `allocation_q1` – `allocation_q4`)
- `notes`
- `highlight_color`
- `payment_custom` (future field)
- `invoice_number`

---

## 10. Data Model Changes

### New columns on `transactions`

| Column | Type | Notes |
|---|---|---|
| `source` | TEXT | `'odoo'` or `'manual'`. Default: `'manual'` for existing rows |
| `odoo_opportunity_id` | TEXT | System-only. Not editable. Not visible in UI |
| `odoo_sale_order_id` | TEXT | System-only. Not editable. Not visible in UI |
| `invoice_status` | TEXT | From `sale.order`. Values: `nothing`, `to invoice`, `invoiced` |
| `amount_odoo` | NUMERIC | From `crm.lead.expected_revenue`. Reference only |
| `amount_sales` | NUMERIC | From `sale.order.amount_total`. Reference only |
| `last_sync_at` | TIMESTAMPTZ | Timestamp of last successful sync for this record |

### Existing columns — no changes
- `opportunity_odoo` — kept as deprecated legacy field, not used by sync
- `tcv` — remains the primary amount field used in all calculations

### New column on `sellers`

| Column | Type | Notes |
|---|---|---|
| `odoo_user_id` | INTEGER | Odoo user ID for seller mapping |

### Seller mapping logic
1. Primary: match `crm.lead.user_id` → `sellers.odoo_user_id`
2. Fallback: match by `name_normalized`

---

## 11. Sync

### Frequency
- **Automatic:** once per day at 08:30 (ART, UTC-3)
- **Manual:** via a "Sync" button in the UI (admin only)

### Sync logic
```
1. Fetch all active crm.lead records from Odoo
2. Fetch all sale.order records with opportunity_id set
3. For each crm.lead:
   a. Match by odoo_opportunity_id in transactions table
   b. If match found → update Odoo-owned fields only
   c. If no match → create new transaction (source = 'odoo')
4. Apply sale.order data (priority rules from Section 7)
5. Apply amount resolution rules (Section 6)
6. Apply stage rules (Section 5)
7. Set last_sync_at = now()
8. Log field changes (old_value, new_value, source = 'odoo')
```

### What sync never does
- Overwrite Forecast-owned fields (quarter, notes, highlight_color, etc.)
- Create duplicate transactions
- Touch transactions where `source = 'manual'`
- Create a transaction from a `sale.order` without an `opportunity_id`

---

## 12. Odoo API Access

| Setting | Value |
|---|---|
| Protocol | XML-RPC (standard Odoo) |
| Auth | Username + API key |
| Models used | `crm.lead`, `sale.order` |
| Instance URL | To be provided |

---

## 13. Odoo CRM — Required Fields

### Custom fields to be created in `crm.lead`

| Field name | Type | Required | Values / Notes |
|---|---|---|---|
| `x_brand` | Selection | Yes | `NETWORKING`, `AUDIO/VIDEO+DC`, `INFRA`, `FORTINET`, `MICROINFORMATICA` |
| `x_subbrand` | Char | No | Free text |
| `x_provider` | Char | No | Free text |
| `x_stage_forecast` | Selection | Yes | `10`, `25`, `50` — manual, not auto-computed |
| `x_description` | Char | Yes | Plain text. Short opportunity description. Example: "Lenovo notebooks renewal" |

### Native fields used from `crm.lead`

| Field | Used as |
|---|---|
| `partner_id` | client_name |
| `user_id` | seller |
| `expected_revenue` | amount_odoo / tcv (before sales) |
| `date_deadline` | due_date |
| `active` | LOSS detection (false = lost) |

### Native fields used from `sale.order`

| Field | Used as |
|---|---|
| `opportunity_id` | Link to crm.lead (must be set) |
| `invoice_status` | Stage forcing + amount switching |
| `amount_total` | amount_sales |
| `date_order` | Recency for multi-order selection |

### Critical Odoo rule
Quotations must always be created **from an opportunity**. Standalone sale orders (no `opportunity_id`) are invisible to sync and will never appear in Forecast. A server-side validation rule or warning should enforce this.

### Provider note
`x_brand` must be a **Selection** (static dropdown). No Many2one needed.

---

## 14. Change Log / History

Track the following changes with: user, timestamp, source (`odoo` / `manual` / `system`):
- Stage changes
- Amount changes
- Quarter changes
- Notes changes

---

## 15. UI Notes

- `odoo_opportunity_id` and `odoo_sale_order_id` are **never shown in the UI**.
- `source` field may be shown as a subtle indicator (e.g. "Odoo" badge on synced transactions).
- Odoo-owned fields should be **read-only** in the edit drawer for synced transactions.
- Forecast-owned fields remain editable regardless of source.
- A "Sync" button visible to admins only (location TBD).
- `amount_odoo` and `amount_sales` may be shown as read-only reference info in the drawer.

---

## 16. Implementation Stages

| Stage | Scope | Status |
|---|---|---|
| 1 | Prepare Odoo: custom fields + validations (provider's responsibility) | Pending |
| 2 | DB migration: add new columns to `transactions` and `sellers` | Pending |
| 3 | Basic CRM sync: fetch `crm.lead`, create/update transactions | Pending |
| 4 | Sales integration: `sale.order` link, 75/100 logic, real amount | Pending |
| 5 | Field ownership enforcement: protect Forecast-owned fields during sync | Pending |
| 6 | Change log / history | Pending |
| 7 | UI: read-only Odoo fields, Sync button, source badge, description visible | Pending |
| 8 | Testing with real Odoo data | Pending |

---

## 17. Risks

| Risk | Mitigation |
|---|---|
| Missing CRM fields (brand, subbrand, etc.) | Fields are required in Odoo — sync skips or warns if absent |
| Sale orders without opportunity_id | Enforce validation rule in Odoo; sync ignores orphan orders |
| Duplicate transactions | Always use `odoo_opportunity_id` as unique key; upsert, never insert-only |
| Seller not mapped | Log warning; do not block sync; fallback to name_normalized |
| Inconsistent brand text | `x_brand` is a dropdown in Odoo — prevents free-text variation |
| Odoo URL / credentials not yet available | Sync logic built with config placeholder; activated when credentials provided |
