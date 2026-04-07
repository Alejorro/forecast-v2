DOT4 Forecast V2 — App Structure

  UX Principles

  1. Transactions are the center of gravity — every other screen is a lens on transaction data
  2. No surprises in numbers — weighted values always show their source (TCV x stage%)
  3. LOSS hidden by default, never deleted — toggle restores them; keeps workflow clean
  4. Null gaps shown as null, not zero — silence is deceptive
  5. One action per moment — forms are drawers, not pages; user never loses list context
  6. Quarter allocations always visible in the transaction form (not hidden in a tab)
  7. Keyboard-first editing — Tab through fields, Enter to save, Escape to close
  8. No confirm dialogs for edits, only for soft-delete

  ---
  Navigation Structure

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

  Year selector is global — changes scope across all screens without page reload. Modals/drawers used for: Transaction create, edit, duplicate, Import preview.

  ---
  Screen 1: Overview

  Purpose: One-glance forecast health for the selected year across all brands.

  Sections:
  - KPI Bar — 4 cards: Total Plan, Total Weighted Forecast, Total Won, Total Gap (with Q1–Q4 breakdown per card)
  - Plan vs Forecast vs Won by Quarter — grouped bar chart, 3 bars per quarter
  - Gap by Brand — horizontal bar chart; positive gap = red, ahead = green, no plan = "No plan" label
  - Pipeline by Stage — donut chart, LOSS excluded by default
  - Top 5 Active Opportunities — table, click row opens transaction edit drawer

  Key actions: Change year, click brand → Brands screen, click row → edit drawer, toggle LOSS

  ---
  Screen 2: Transactions (critical)

  Purpose: Daily operational screen — create, find, and edit every transaction.

  Sections:
  - Filter Bar — search (client), brand, seller, stage, quarter dropdowns + LOSS toggle + "Clear filters"
  - Toolbar — count label + "New Transaction" button
  - Transaction Table

  ┌───────────────────┬─────────────────────────────────────────────────────┐
  │      Column       │                        Notes                        │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Client            │ Text                                                │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Brand             │ Text                                                │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Seller            │ Text                                                │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ TCV               │ USD, right-aligned                                  │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Stage             │ Color-coded badge                                   │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Weighted Value    │ TCV × stage%, right-aligned                         │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Q1 / Q2 / Q3 / Q4 │ Per-quarter weighted value; blank if allocation = 0 │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Status            │ Only visible when LOSS toggle is on                 │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Actions           │ Edit / Duplicate / Delete icons                     │
  └───────────────────┴─────────────────────────────────────────────────────┘

  LOSS rows shown dimmed (reduced opacity).

  - Transaction Drawer (slides from right)

  ┌──────────────────┬─────────────────────────┐
  │      Field       │          Notes          │
  ├──────────────────┼─────────────────────────┤
  │ Client           │ Required                │
  ├──────────────────┼─────────────────────────┤
  │ Brand            │ Required                │
  ├──────────────────┼─────────────────────────┤
  │ Seller           │ Required                │
  ├──────────────────┼─────────────────────────┤
  │ TCV              │ USD, required           │
  ├──────────────────┼─────────────────────────┤
  │ Stage            │ Required; 5 options     │
  ├──────────────────┼─────────────────────────┤
  │ Status           │ Optional (LOSS only)    │
  ├──────────────────┼─────────────────────────┤
  │ Year             │ Defaults to global year │
  ├──────────────────┼─────────────────────────┤
  │ Q1–Q4 Allocation │ 0–1 each; must sum to 1 │
  ├──────────────────┼─────────────────────────┤
  │ Notes            │ Optional                │
  └──────────────────┴─────────────────────────┘

  Live preview below allocations: Q1: $5,000 | Q2: $10,000 | Q3: $0 | Q4: $0 | Total: $15,000
  Allocation validation: inline error if sum ≠ 1 (no auto-correct).

  Key actions: Search/filter, create, edit, duplicate, soft-delete (confirm dialog), sort, toggle LOSS

  ---
  Screen 3: Plans

  Purpose: Set quarterly revenue targets per brand per year.

  Sections:
  - Plans Table — one row per brand, inline editable quarterly cells

  ┌──────────────────────┬────────────────────────────────────┐
  │        Column        │               Notes                │
  ├──────────────────────┼────────────────────────────────────┤
  │ Brand                │ Read-only                          │
  ├──────────────────────┼────────────────────────────────────┤
  │ Q1–Q4 Plan           │ USD, inline editable               │
  ├──────────────────────┼────────────────────────────────────┤
  │ FY Plan              │ Computed (Q1+Q2+Q3+Q4), read-only  │
  ├──────────────────────┼────────────────────────────────────┤
  │ FY Weighted Forecast │ From transactions, read-only       │
  ├──────────────────────┼────────────────────────────────────┤
  │ FY Gap               │ plan − forecast; "No plan" if null │
  └──────────────────────┴────────────────────────────────────┘

  - Totals row — pinned at bottom
  - Changed cells highlighted until saved; single "Save all changes" button

  Key actions: Edit plan cells inline, save all, view forecast vs plan per brand

  ---
  Screen 4: Brands

  Purpose: Forecast performance for a specific brand across quarters and stages.

  Sections:
  - Brand Selector — horizontal tab row (one tab per brand)
  - KPI Cards — Plan, Weighted Forecast, Won, Gap (scoped to brand)
  - Quarterly Breakdown Table — Plan / Weighted Forecast / Won / Gap per quarter
  - Pipeline by Stage — donut chart scoped to brand
  - Top Transactions — top 10 with "Show all" link → Transactions screen pre-filtered

  Key actions: Switch brands, click transaction → edit drawer, "Show all transactions", toggle LOSS

  ---
  Screen 5: Sellers

  Purpose: Individual seller contribution to forecast.

  Sections:
  - Seller Summary Table

  ┌───────────────────┬──────────────────────────────────┐
  │      Column       │              Notes               │
  ├───────────────────┼──────────────────────────────────┤
  │ Seller            │ Name                             │
  ├───────────────────┼──────────────────────────────────┤
  │ Deal Count        │ Active transactions              │
  ├───────────────────┼──────────────────────────────────┤
  │ TCV Total         │ Sum of TCV                       │
  ├───────────────────┼──────────────────────────────────┤
  │ Weighted Forecast │ Sum of weighted_total            │
  ├───────────────────┼──────────────────────────────────┤
  │ Won               │ Stage = "Won" only               │
  ├───────────────────┼──────────────────────────────────┤
  │ Contribution %    │ Seller / total weighted forecast │
  └───────────────────┴──────────────────────────────────┘

  - Inline expansion — click a row to expand; fetches that seller's transactions on demand; columns: Client, Brand, Stage, TCV, Weighted (no Q1–Q4)
  - Totals footer row — sum of all sellers; border-t-2 border-slate-400 + bg-slate-100 for clear separation

  Column hierarchy (visual weight):
  - Weighted Forecast → font-bold text-slate-900 (primary signal)
  - Won → font-semibold text-green-700 (success signal)
  - TCV Total → text-slate-600 (neutral)
  - Deals → text-slate-400 (secondary, least important)

  Contribution % column:
  - Inline bar: w-20 h-2.5, bg-blue-600 fill on bg-slate-100 track
  - Percentage number right of bar, tabular-nums
  - Bar width = contribution_pct capped at 100%

  Default sort: Weighted Forecast DESC (ranking table behavior)

  Chevron expand icon:
  - Rotates 90° when expanded
  - Color changes from text-slate-400 → text-blue-500 when open

  Key actions: View all sellers ranked by forecast, expand for transaction detail

  ---
  Screen 6: Import / Audit

  Purpose: Ingest Excel data, validate, preview, and commit.

  Sections:
  - Upload Zone — drag/drop or file picker (.xlsx)
  - Column Mapping Preview — detected columns → mapped internal fields
  - Data Preview — first 20 rows raw
  - Validation Results — valid count, error count, per-row errors (row #, field, reason)
  - Comparison Summary — before/after totals for same year/brand
  - Import Action — "Import valid rows" (skips errors); shows count confirmation before committing

  Key actions: Upload, validate, review errors, compare totals, import valid rows, download error report (CSV)

  ---
  Data Flow Notes

  - weighted_total = TCV × stage_percent (stage_percent derived from stage_label, never stored)
  - qN_value = TCV × stage_percent × allocation_qN (computed on read, not stored)
  - gap = plan − weighted_forecast (null if plan row doesn't exist)
  - LOSS filter is a display concern only — does not affect stored values

  ---
  Overview — Design Decisions

  Color palette
  - Plan bars: #D1D5DB (gray-300) — neutral, clearly secondary to forecast
  - Forecast bars: #2563EB (blue-600) — primary signal color
  - Won bars: #16A34A (green-600) — closed/success
  - Pipeline donut: gray (#E5E7EB) → blue ramp (#93C5FD → #3B82F6 → #1D4ED8) → green (#16A34A)
    gray = early stage, blue progression = pipeline maturity, green = won
  - All blues belong to the Tailwind blue family (blue-300/500/600/700) — no mixed tones

  Chart styling
  - Bar chart: barCategoryGap 10%, barGap 3px — bars fill the group, minimal padding between groups
  - Grid lines: horizontal only, #E2E8F0 (slate-200), solid — visible but not dominant
  - Gap by Brand bars: h-3 (12px), bg-slate-200 track — solid and easy to compare
  - Gap bars show forecast/plan progress ratio (0–100%), not raw gap magnitude

  Typography
  - Section headings: text-xs font-semibold uppercase tracking-wider text-slate-500
  - Primary values (KPI, gap amount): text-sm font-semibold tabular-nums
  - Secondary text (forecast · plan line): text-xs text-slate-500 tabular-nums
  - Percentage labels: text-xs text-slate-500 font-medium — one visual unit with the gap value

  Visual principles
  - Every element has a clear role: gray = baseline/plan, blue = active forecast, green = success/won
  - Secondary information is darker than slate-400 (use slate-500 minimum) to stay readable
  - No decorative color — every color encodes meaning