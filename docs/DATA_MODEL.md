# DATA_MODEL.md

## Entities

### Brand
- id
- name

### Seller
- id
- name

### Plan
- id
- year
- brand_id
- q1_plan
- q2_plan
- q3_plan
- q4_plan

## IMPORTANT
fy_plan is derived as:

fy_plan = q1_plan + q2_plan + q3_plan + q4_plan

If any quarter plan value is null, fy_plan should also be null.
Do not treat null as zero.

---

### Transaction

Fields:
- id
- client_name
- project_name
- seller_id
- brand_id
- sub_brand
- vendor_name
- opportunity_odoo
- brand_opportunity_number
- due_date
- stage_label
- status_label
- tcv
- allocation_q1
- allocation_q2
- allocation_q3
- allocation_q4
- description
- invoice_number
- notes
- created_at
- updated_at
- deleted_at

Note:
- deleted_at is used for soft delete
- transactions with deleted_at must be excluded from operational calculations and active views

---

## CRITICAL MODELING RULES

- DO NOT store stage_percent
- DO NOT store q1/q2/q3/q4 monetary values
- ONLY store inputs, never derived values

---

## Stage Mapping (Derived)

- Identified = 0.10
- Proposal 25 = 0.25
- Proposal 50 = 0.50
- Proposal 75 = 0.75
- Won = 1.0

stage_percent must be derived from stage_label

---

## Allocation Rules

- Each allocation must be between 0 and 1
- allocation_q1 + allocation_q2 + allocation_q3 + allocation_q4 = 1.0
- default case: 100% in one quarter
- split across quarters is allowed

---

## Derived Values

weighted_total = tcv × stage_percent

q1_value = weighted_total × allocation_q1
q2_value = weighted_total × allocation_q2
q3_value = weighted_total × allocation_q3
q4_value = weighted_total × allocation_q4

---

## Transaction Year

Transaction year is derived from:
year(due_date)

Transactions without due_date should not be used in plan vs gap calculations.

---

## Reference / Display-Only Fields

These fields have no business logic.

- sub_brand: optional text
- vendor_name: optional text
- opportunity_odoo: optional reference
- brand_opportunity_number: optional reference