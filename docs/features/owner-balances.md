# Owner balances & shareholder loans

[← Docs index](../README.md) · Related: [Expenses](expenses.md) · [Tax rules → s.15(2)](../tax-rules.md#shareholder-loans-s152)

**Route** `/balances` (`?new=1` opens Settle up) · **Files** `web/src/app/(app)/balances/**`, `web/src/components/balances/*`
**Data** `member_balances`, `member_ledger`, `member_transfers`, `expenses.settlement_transfer_id`, `mileage_trips.settlement_transfer_id`

## Sign convention
**Positive = the company owes the owner.** Contributions to:

| Movement | Effect |
|---|---|
| Business spending paid personally | + |
| Personal share paid with business money | − |
| Mileage | + |
| Start-up loans / contributions | + |
| Reimbursement (company → owner) | − |
| Repayment (owner → company) | + |
| Dividend / salary / other | 0 (not a loan movement) |

## Screen
- Card per owner: headline ("Company owes Deeparsh $2,101.72"), breakdown lines with "not yet settled"
  amounts, open-item count, Settle up.
- **Shareholder-loan explainer** with each open personal item's **repay-by date** (end of the fiscal
  year after the one it arose in); warnings within `shareholder_loan_alert_days`.
- Ledger timeline with running balance.

## Settle up
Kind (reimbursement, repayment, contribution, dividend, salary, other), amount defaulting to what
clears the open items, date, account, and which items it covers. Saving links covered expenses/trips
via `settlement_transfer_id` and marks them settled/reimbursed. **Offset only** settles both
directions without moving money. Deleting a transfer re-opens exactly what it covered (`on_transfer_delete`). Undo toast.
