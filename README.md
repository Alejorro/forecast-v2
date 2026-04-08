@frontend-developer

Read:
- docs/UI_DESIGN.md
- docs/VISUAL_GUIDELINES.md

Update Transactions UI and New Transaction modal so LOSS is handled as a Stage option.

Current desired behavior:
- Stage dropdown must include:
  - Identified 10%
  - Proposal 25%
  - Proposal 50%
  - Proposal 75%
  - Won 100%
  - LOSS
- by default, Transactions screen shows only active transactions
- when Show LOSS toggle is ON, show ONLY LOSS transactions
- do NOT mix LOSS and active rows

Requirements:

1. New Transaction / Edit Transaction modal
- add LOSS to the Stage dropdown
- do NOT reintroduce a separate Status field
- Stage remains the single source of truth

2. Transactions table behavior
- default mode:
  show only non-LOSS transactions
- Show LOSS toggle ON:
  show only LOSS transactions
  hide all active transactions

3. Toggle behavior
- keep current Show LOSS toggle
- make it a true mode switch:
  OFF = active only
  ON = LOSS only

4. Visual clarity
- LOSS rows should be clearly identifiable in the table
- keep current design system
- do not redesign the whole page

5. Modal behavior
- if Stage = LOSS, keep the UI simple
- avoid broken weighted/forecast previews
- make sure the form still behaves cleanly

6. Important
- do NOT create a separate status workflow
- do NOT mix LOSS and active rows
- do NOT redesign the Transactions screen
- only update behavior and stage handling

Output:
- files changed
- updated modal behavior
- updated Transactions behavior
- how LOSS display now works