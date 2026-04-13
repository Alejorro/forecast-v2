# Forecast V2 — Frontend Reference

> **Purpose of this document:** Complete reference for the frontend, UI, and interaction layer. Sufficient to build or understand all screens and components without reading any other file.

---

## 1. Frontend Architecture

### Tech stack
- **Framework:** React (with Vite as build tool)
- **Styling:** Tailwind CSS
- **Charts:** Recharts (implied by chart specifications)

### Core principles
- Tables are the primary UI element. Charts support decisions; they do not dominate.
- Transactions are the center of gravity — every other screen is a lens on transaction data.
- Usability over visuals. Data-first design.
- The application is a professional internal business tool. It must feel clean, structured, calm.
- Avoid: dark dashboards, neon colors, gradients, glassmorphism, heavy shadows, cluttered layouts, decorative UI.

---

## 2. App Shell & Navigation

### Structure

```
App Shell
├── [Top nav — always visible]
│   ├── Logo / App name
│   ├── Year selector (global, affects all screens)
│   └── Nav: Overview | Transactions | Plans | Brands | Sellers | Import
│
├── Overview          (default landing)
├── Transactions      (primary operational screen)
├── Plans             (target management)
├── Brands            (brand-level analysis)
├── Sellers           (seller-level analysis)
└── Import / Audit    (data ingestion)
```

### Global year selector
- Persists in the top navigation at all times.
- Changing the year scopes all screens simultaneously without a page reload.
- All data fetching must respect the selected year.

### Modal/drawer usage
Forms never navigate away from the list. They appear as:
- Right-side drawers: Transaction create, edit, duplicate
- Modal overlays: Import preview

---

## 3. Color System

### Base palette

| Role | Value |
|---|---|
| Page background | `#F8FAFC` |
| Card background | `#FFFFFF` |
| Borders | `#E2E8F0` (slate-200) |
| Primary text | `#0F172A` |
| Secondary text | `#64748B` (slate-500) |

### Functional colors

| Role | Value | Tailwind |
|---|---|---|
| Primary (actions, buttons) | `#2563EB` | blue-600 |
| Success / Won | `#16A34A` | green-600 |
| Warning / Pipeline | `#F59E0B` | amber-500 |
| Danger / Negative gap | `#DC2626` | red-600 |
| Neutral | `#94A3B8` | slate-400 |

### Chart color semantics
Every color in charts encodes meaning. No decorative color.

| Element | Color |
|---|---|
| Plan bars | `#D1D5DB` (gray-300) — neutral, secondary signal |
| Forecast bars | `#2563EB` (blue-600) — primary signal |
| Won bars | `#16A34A` (green-600) — closed/success |
| Pipeline donut (early stage) | `#E5E7EB` (gray) |
| Pipeline donut (pipeline maturity ramp) | `#93C5FD` → `#3B82F6` → `#1D4ED8` (blue-300 → blue-500 → blue-700) |
| Pipeline donut (Won) | `#16A34A` (green-600) |

All blues must belong to the Tailwind `blue` family. No mixed blue tones.

### Stage badge colors

| Stage | Color style |
|---|---|
| Identified | Neutral gray (soft background) |
| Proposal 25 | Light amber |
| Proposal 50 | Amber |
| Proposal 75 | Soft orange |
| Won | Green |
| LOSS | Muted gray |

Badges: soft background, darker text, rounded corners, no strong borders.

### Gap bar color
- Positive gap (forecast below plan): red (`#DC2626`)
- Ahead of plan (forecast exceeds plan): green (`#16A34A`)
- No plan: "No plan" label (no color)

---

## 4. Typography

### Hierarchy

| Level | Usage | Tailwind |
|---|---|---|
| Section headings | Screen section labels | `text-xs font-semibold uppercase tracking-wider text-slate-500` |
| KPI numbers | Large dashboard values | `text-2xl` or larger, bold |
| Primary values | Gap amount, weighted forecast | `text-sm font-semibold tabular-nums` |
| Secondary text | Forecast · plan lines | `text-xs text-slate-500 tabular-nums` |
| Percentage labels | Gap %, contribution % | `text-xs text-slate-500 font-medium` |
| KPI labels | Labels below KPI numbers | Small, muted color |

Use `tabular-nums` for all numeric columns to ensure alignment stability.

---

## 5. Layout Principles

- Strong spacing between sections: `gap-6` or more.
- Internal spacing: consistent. Elements must never visually touch.
- Consistent horizontal alignment across all elements.
- No cramped layouts.

---

## 6. Component Library

### Cards
- White background (`#FFFFFF`)
- Subtle border (`#E2E8F0`)
- Very minimal box shadow
- Padding: 16–24px

### Tables (critical)
- High readability
- Numbers: right-aligned
- Comfortable row height
- Clear column spacing
- Avoid: dense rows, excessive separators, unnecessary borders

### Buttons
| Variant | Style |
|---|---|
| Primary | Blue background (`blue-600`) |
| Secondary | Outline or subtle gray |
| Destructive | Red |

### Drawers
- Slide in from the right side of the screen.
- Never replace the page or navigate away from the list.

### Stage badges
- See stage badge colors above.
- Rounded corners, no strong border, soft background, darker text.

### Contribution % bar
- Track: `w-20 h-2.5 bg-slate-100`
- Fill: `bg-blue-600`
- Bar width = `contribution_pct` capped at 100%
- Percentage number displayed to the right of the bar, `tabular-nums`

### Chevron expand icon
- Rotates 90° when the row is expanded
- Color: `text-slate-400` (collapsed) → `text-blue-500` (expanded)

---

## 7. Screen Specifications

---

### Screen 1: Overview

**Purpose:** One-glance forecast health for the selected year across all brands.

**Sections:**

**KPI Bar**
- 4 cards: Total Plan, Total Weighted Forecast, Total Won, Total Gap
- Each card includes a Q1–Q4 breakdown
- Values: `text-2xl font-bold`; labels: small, muted

**Plan vs Forecast vs Won by Quarter — grouped bar chart**
- 3 bars per quarter group (Plan, Forecast, Won)
- `barCategoryGap: 10%`, `barGap: 3px`
- Horizontal grid lines only: `#E2E8F0` (slate-200), solid
- Colors: Plan = gray-300, Forecast = blue-600, Won = green-600

**Gap by Brand — horizontal bar chart**
- Bar height: `h-3` (12px), track: `bg-slate-200`
- Bars show forecast/plan progress ratio (0–100%), not raw gap magnitude
- Positive gap (behind): red; ahead: green; no plan: "No plan" label

**Pipeline by Stage — donut chart**
- LOSS excluded by default
- Color ramp: gray (early) → blue progression → green (Won)

**Top 5 Active Opportunities — table**
- Active = not Won, not LOSS, not soft-deleted
- Ranked by `weighted_total` descending
- Clicking a row opens the transaction edit drawer

**Key interactions:** Change year, click brand → Brands screen, click row → edit drawer, toggle LOSS visibility.

---

### Screen 2: Transactions

**Purpose:** Daily operational screen for creating, finding, and editing every transaction.

**Filter Bar**
- Search field: filters by client name
- Dropdowns: Brand, Seller, Stage, Quarter
- LOSS toggle: shows/hides LOSS transactions
- "Clear filters" button
- Quarter filter rule: shows transactions where `allocation > 0` for the selected quarter

**Toolbar**
- Transaction count label (e.g., "23 transactions")
- "New Transaction" button (opens create drawer)

**Transaction Table**

| Column | Notes |
|---|---|
| Client | Text |
| Brand | Text |
| Seller | Text |
| TCV | USD, right-aligned |
| Stage | Color-coded badge |
| Weighted Value | `TCV × stage%`, right-aligned |
| Q1 / Q2 / Q3 / Q4 | Per-quarter weighted value; blank if allocation = 0 |
| Status | Only visible when LOSS toggle is on |
| Actions | Edit / Duplicate / Delete icons |

- **Row highlight:** If a transaction has a `highlight_color` set, its row gets a soft rgba background + a 3px left border in the same hue. Colors: green `rgba(34,197,94,0.10)` / yellow `rgba(234,179,8,0.12)` / orange `rgba(249,115,22,0.12)` / red `rgba(239,68,68,0.10)`. Border at 40% opacity. Applied via inline `style`, not Tailwind classes. LOSS rows always use `bg-slate-50` regardless of `highlight_color`. Dot selectors in the drawer use the same exact `rgb()` values for visual consistency.
- LOSS rows appear dimmed (reduced opacity) when the toggle is on.

**Transaction Drawer (slides from right)**

| Field | Notes |
|---|---|
| Client | Required |
| Highlight color | 4 colored dots (green/yellow/orange/red) shown directly below the Client field. Click to select; click again to deselect. Sets `highlight_color` on the transaction. |
| Brand | Required (dropdown from brand list) |
| Seller | Required (dropdown from seller list) |
| TCV | USD, required |
| Stage | Required; dropdown with 5 options |
| Status | Optional; only valid value is LOSS |
| Year | Defaults to the global year selector value |
| Quarter | Q1 / Q2 / Q3 / Q4 / Q1-Q4 |
| Q1-Q4 distribution | When Q1-Q4 is selected: 4 USD amount inputs appear (Q1/Q2/Q3/Q4). Pre-filled with TCV/4. Sum must equal TCV. Auto-balance on blur or via "Auto completar" button (max auto-adjust: $999). Adjusted quarter is highlighted in amber. |
| Notes | Optional |

- **Live allocation preview** below the allocation fields: `Q1: $X | Q2: $X | Q3: $X | Q4: $X | Total: $X`
- Allocation validation: inline error if sum ≠ 1.0. No auto-correction.
- **No confirm dialog for edits.**
- **Confirm dialog required for soft-delete.**

**Keyboard shortcuts:** Tab to move between fields, Enter to save, Escape to close.

---

### Screen 3: Plans

**Purpose:** Set quarterly revenue targets per brand for the selected year.

**Plans Table**

| Column | Notes |
|---|---|
| Brand | Read-only |
| Q1 Plan | USD, inline editable |
| Q2 Plan | USD, inline editable |
| Q3 Plan | USD, inline editable |
| Q4 Plan | USD, inline editable |
| FY Plan | Computed (Q1+Q2+Q3+Q4), read-only. Null if any quarter is null. |
| FY Weighted Forecast | From transactions, read-only |
| FY Gap | `plan − forecast`; shown as "No plan" if null |

- Changed cells are **highlighted** until saved.
- Single **"Save all changes"** button commits all pending edits at once.
- Totals row **pinned at the bottom**.

---

### Screen 4: Brands

**Purpose:** Forecast performance for a specific brand across quarters and stages.

**Brand Selector**
- Horizontal tab row — one tab per brand.

**Per-brand Sections:**

- **KPI Cards:** Plan, Weighted Forecast, Won, Gap (scoped to selected brand)
- **Quarterly Breakdown Table:** Plan / Weighted Forecast / Won / Gap per quarter
- **Pipeline by Stage:** Donut chart scoped to selected brand; LOSS excluded by default
- **Top Transactions:** Top 10 transactions with "Show all" link that navigates to the Transactions screen pre-filtered to that brand

**Key interactions:** Switch brands via tabs, click transaction row → edit drawer, "Show all transactions" link, toggle LOSS.

---

### Screen 5: Sellers

**Purpose:** Individual seller contribution to forecast, ranked by performance.

**Seller Summary Table**

| Column | Visual weight |
|---|---|
| Seller | Name |
| Deal Count | Active transactions — `text-slate-400` (least important) |
| TCV Total | Sum of TCV — `text-slate-600` (neutral) |
| Weighted Forecast | Sum of `weighted_total` — `font-bold text-slate-900` (primary signal) |
| Won | Stage = "Won" only — `font-semibold text-green-700` (success signal) |
| Contribution % | `seller_weighted / total_weighted` — inline bar + percentage number |

**Default sort:** Weighted Forecast descending (ranking table behavior).

**Inline row expansion:**
- Click a seller row to expand.
- Fetches that seller's transactions on demand.
- Expanded columns: Client, Brand, Stage, TCV, Weighted (no Q1–Q4 in expanded view).

**Totals footer row:**
- Pinned at the bottom.
- `border-t-2 border-slate-400` + `bg-slate-100` for visual separation.

---

### Screen 6: Import / Audit

**Purpose:** Ingest Excel data, validate, preview, and commit.

**Sections:**

- **Upload Zone:** Drag/drop or file picker (`.xlsx` only)
- **Column Mapping Preview:** Detected columns → mapped internal fields
- **Data Preview:** First 20 rows of raw data
- **Validation Results:** Valid count, error count; per-row errors showing row #, field, reason
- **Comparison Summary:** Before/after totals for the same year/brand
- **Import Action:** "Import valid rows" button — skips rows with errors; shows count confirmation before committing
- **Error report:** Download as CSV

---

## 8. Interaction Design

### Core interaction rules
1. Transactions are the center of gravity — every other screen is a lens on transaction data.
2. Weighted values always show their derivation source (`TCV × stage%`).
3. LOSS is hidden by default, never deleted — toggle restores; keeps workflow clean.
4. Null gaps shown as null ("No plan"), not zero — silence is deceptive.
5. One action per moment — forms are drawers, not pages; user never loses list context.
6. Quarter allocations always visible in the transaction form (not hidden in a tab).
7. Keyboard-first editing: Tab through fields, Enter to save, Escape to close.
8. No confirm dialogs for edits. Confirmation required only for soft-delete.

### Click behavior
- Row click in Top Opportunities (Overview) → opens edit drawer
- Row click in Sellers table → expands inline (no navigation)
- Brand click in Overview Gap chart → navigates to Brands screen
- "Show all" link in Brands → navigates to Transactions screen pre-filtered to that brand

### Feedback
- Allocation sum validation: inline error message, no auto-correct.
- Unsaved plan changes: cells remain highlighted until "Save all changes" is clicked.
- Import results: success count, error count, per-row error detail.

---

## 9. Data Presentation Rules

### Numbers
- All monetary values: right-aligned, USD, formatted with thousands separator.
- Use `tabular-nums` for all numeric columns.
- Null values: display as blank or "No plan", never as zero.

### LOSS visibility
- LOSS transactions: hidden by default in all operational views.
- When LOSS toggle is on: rows appear dimmed (reduced opacity); Status column becomes visible in the Transactions table.

### Quarter columns in Transactions table
- Q1/Q2/Q3/Q4 columns: display per-quarter weighted value.
- Blank (not zero) if the transaction has zero allocation for that quarter.

### Weighted Forecast derivation label
- Wherever weighted values are shown, their formula source must be traceable: `TCV × stage%`.

---

## 10. Consistency Rules

| Pattern | Rule |
|---|---|
| Monetary values | Right-aligned, USD, thousands separator, `tabular-nums` |
| Null values | Never displayed as zero; show blank or "No plan" |
| Form location | Always right-side drawer; never full-page navigation |
| LOSS state | Always hidden by default; toggle required to view |
| Confirm dialogs | Only for soft-delete; not for edits |
| Year scope | Global year selector; applies to all screens simultaneously |
| Gap color | Positive (behind) = red; ahead = green; null = no color |
| Primary charts | Plan = gray, Forecast = blue, Won = green |
| Stage display | Color-coded badge; soft background, darker text, rounded corners |

---

## 11. Responsive Behavior

Not specified. The application is an internal desktop business tool. No explicit responsive/mobile requirements are documented.

---

## 12. Localization

The UI is localized to Spanish (es-AR). All display strings are centralized in `frontend/src/utils/t.js` — a single exported object with keys grouped by page/component.

### Rules
- General UI text, buttons, labels, navigation, form fields, system messages → Spanish
- Corporate/industry terms kept in English: Brand, Sub Brand, TCV, Weighted, Forecast, Pipeline, Won, Gap, FY, Plan, Quarter, Odoo Opportunity, Brand Opp #, LOSS, stage values (IDENTIFIED, PROPOSAL, WON)
- Stage label → "Estado" (column header), but stage values remain in English
- "Quarter" → kept as "Quarter" (not translated to "Trimestre")

### Usage
Import `t` from `'../utils/t'` in any component that needs translated strings. The object is organized by page (`t.transactions`, `t.drawer`, `t.plans`, `t.brands`, `t.sellers`, `t.overview`, `t.import`) plus shared keys at the root (`t.loading`, `t.retry`, `t.total`, `t.noPlan`, `t.year`).

---

## 13. Existing Components

> **Note:** Placeholder. Fill in with the actual component files once confirmed. Without this, a new instance may create duplicate components or ignore existing ones.

```
frontend/src/
├── components/
│   └── (to be documented)
├── pages/
│   └── (to be documented)
└── (other structure — to be documented)
```

| Component | File path | Notes |
|---|---|---|
| — | — | _To be filled in_ |

---

## 14. Frontend Conventions

- Use Tailwind utility classes exclusively for styling. No custom CSS unless unavoidable.
- All blues from the Tailwind `blue` family. No mixed blue tones.
- Chart library: **to be confirmed** (Recharts assumed — verify against `package.json` before implementing charts).
- `tabular-nums` on all numeric/monetary cells for consistent column width.
- Derivation displayed explicitly: always show how weighted values are computed (`TCV × stage%`).
- Do not use dark themes, decorative gradients, or glassmorphism.

---

## 15. Relevant Constraints from CLAUDE.md

- Prioritize usability over visuals.
- Tables are the primary UI element; charts support decisions but do not dominate.
- React + Vite + Tailwind is the required frontend stack.
- Keep code simple. Avoid unnecessary abstractions.
- Do not invent UI behavior not specified here.
- If something is unclear, ask before implementing.
