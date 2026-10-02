# Subscriptions & mileage

[← Docs index](../README.md) · Related: [Expenses](expenses.md) · [Tax rules → mileage](../tax-rules.md#mileage)

## Subscriptions — `/subscriptions`
**Files** `web/src/app/(app)/subscriptions/**`, `web/src/components/expenses/subscriptions.tsx` · **Data** `recurring_expenses`

- Monthly and annualised cost in CAD, next charge, who/how paid, active switch, edit sheet.
- **Due this week** section; **price-change** badge when the last logged amount differs.
- **Log this month's charge** creates the expense (`source='recurring'`) and advances `next_on` by one period (undo available).

## Mileage — `/mileage` (`?new=1`)
**Files** `web/src/app/(app)/mileage/**` (+ `export/route.ts`), `web/src/components/expenses/mileage.tsx` · **Data** `mileage_trips`

- Per-owner fiscal-year cards (km, $, progress toward 5,000 km), trips by month.
- Trip sheet: date, from, to, purpose, km, round-trip toggle (doubles km), member, project, frequent routes.
- Rate from `mileage_rate_for()` — blended across the 5,000 km threshold per calendar year — stored on the trip.
- **Reimburse** records a real reimbursement transfer so owner balances move.
- `GET /mileage/export` — CRA-style logbook CSV (date, destination, purpose, km, running total).
