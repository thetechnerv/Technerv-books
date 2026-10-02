# Payments received

[← Docs index](../README.md) · Related: [Invoices](invoices.md) · [Banking](banking.md)

**Route** `/payments` · **Files** `web/src/app/(app)/payments/**`, `web/src/components/invoices/payment-*.ts(x)`, `payments-view.tsx`
**Data** `payments`, `payment_allocations` (triggers update `invoices.amount_paid` + status)

- List grouped by month with totals; filters by method and client (`?client=`), search by reference.
- `?new=1[&client=&invoice=]` opens **Record payment**; `?id=<payment>` opens/highlights a payment (used by search).
- Record sheet: client → open invoices auto-allocated **oldest first** (editable per invoice), amount
  (defaults to balance), date, method (e-Transfer, EFT, wire, cheque, card, cash, other), deposit
  account (CAD → EQ Bank Business, USD → EQ USD), reference, notes, FX rate for USD (`fx_rates`).
  Any unapplied remainder is shown.
- Detail sheet: edit, delete (confirm) — invoice statuses revert automatically.
- Bank deposits can also become payments from the review queue ([banking.md](banking.md)).
