# RULES.md

## Stage Rules

Allowed values:

- Identified = 10%
- Proposal 25 = 25%
- Proposal 50 = 50%
- Proposal 75 = 75%
- Won = 100%

Stage is selected via stage_label only.

---

## Status Rules

Allowed values:
- LOSS

status_label may be null.
If present, only LOSS is currently recognized by business rules.
If a status_label is provided and is not recognized, reject the record during import, manual creation, or manual editing.

Notes:
- LOSS represents a lost opportunity
- status_label does NOT affect calculations
- LOSS is hidden in operational views by default

---

## Currency

The system uses a single currency: USD

- no multi-currency logic
- no conversion
- all values are assumed to be in USD

---

## Forecast Calculation

weighted_total = TCV × stage_percent

Example:
- TCV = 20000
- Stage = 25%
- Weighted = 5000

---

## Quarter Distribution

Transactions are assigned using allocation:

- allocation_q1
- allocation_q2
- allocation_q3
- allocation_q4

Each allocation:
- must be between 0 and 1
- must sum to 1

---

## Gap Calculation

gap = plan - weighted_forecast

A positive gap means forecast is below plan (behind target).
A negative gap means forecast exceeds plan.

Missing plan behavior:

- If no Plan row exists for a given brand/year:
  - gap = null
  - do not assume zero
  - do not invent fallback values

- If a Plan row exists but the relevant quarter plan value is null:
  - quarter gap = null

- If a Plan row exists and the relevant quarter plan value is 0:
  - quarter gap = 0 - quarter_weighted_forecast

---

## Won Logic

- Won = stage_label = "Won"
- Won is INCLUDED in weighted_forecast
- Won is shown separately only for visibility

---

## Forecast Definition

Forecast values are always scope-dependent.

For a given brand, year, and quarter:
quarter_weighted_forecast = sum of qN_value across all active in-scope transactions for that quarter

For a given brand and year:
fy_forecast = q1_weighted_forecast + q2_weighted_forecast + q3_weighted_forecast + q4_weighted_forecast

When using the generic term weighted_forecast:
- at quarter level, it means quarter_weighted_forecast
- at fiscal year level, it means fy_forecast

## Forecast Scope

All forecast calculations must match the same scope as plan:

- by year
- by brand
- by quarter

An in-scope transaction must:
- match the requested year
- match the requested brand
- contribute to the requested quarter when quarter-based calculations are used
- have deleted_at = null

weighted_forecast must always be calculated within the same scope as the plan it is compared against.

---

## Quarter Forecast Definitions

For a given brand, year, and quarter:

q1_weighted_forecast = sum of q1_value across all in-scope transactions
q2_weighted_forecast = sum of q2_value across all in-scope transactions
q3_weighted_forecast = sum of q3_value across all in-scope transactions
q4_weighted_forecast = sum of q4_value across all in-scope transactions

---

## FY Forecast

For a given brand and year:

fy_forecast = q1_weighted_forecast + q2_weighted_forecast + q3_weighted_forecast + q4_weighted_forecast

---

## Invalid Stage Handling

If a stage_label is not recognized:
- reject the record during import
- reject the record during manual creation or manual editing
- do not assign default values

---

## Filtering Rules

- deleted_at IS NOT NULL → exclude transaction
- LOSS does NOT affect calculations (for now)

---

## Quarter Behavior Note

Transactions split across quarters may appear in multiple quarter views.

Totals across quarters should not be summed manually.