# SCREENS.md

## 1. Overview

Purpose:

Default scope:
The Overview shows values for one selected year.
It may show all brands combined by default, with brand drill-down available in other screens.

Quick understanding of forecast status.

Show:
- Total plan
- Total weighted forecast
- Total won
- Total gap

Charts:
- Plan vs Forecast vs Won by quarter
- Gap by brand
- Pipeline by stage

LOSS transactions are hidden by default in this chart.

Top Opportunities:
Top 5 active transactions by weighted_total

Active means:
- not Won
- not LOSS
- not soft-deleted

---

## 2. Transactions

Purpose:
Main operational screen.

Features:
- Search
- Filters (brand, seller, stage, quarter)
- Create transaction
- Edit transaction
- Duplicate
- Delete (soft)

Columns:
- Client
- Brand
- Seller
- TCV
- Stage
- Weighted value
- Quarter impact

Quarter filter rule:
Show transactions where allocation > 0 for that quarter.

Default display rule:
LOSS transactions are hidden by default in operational views.
They may be shown later through an explicit filter if needed.

---

## 3. Plans

Purpose:
Manage targets.

Features:
- Edit plan by brand and quarter
- View totals
- Compare vs forecast

---

## 4. Brands

Purpose:
Analyze by brand.

Show:

LOSS transactions are hidden by default in pipeline-oriented views.

- Plan
- Forecast
- Won
- Gap
- Pipeline
- Top transactions

---

## 5. Sellers

Purpose:
Analyze seller performance.

Show:

LOSS transactions are hidden by default in pipeline-oriented views.

- Forecast
- Won
- Deals count
- Contribution

---

## 6. Import / Audit

Purpose:
Excel integration.

Features:
- Upload Excel
- Preview data
- Validate mapping
- Compare totals
- Show errors