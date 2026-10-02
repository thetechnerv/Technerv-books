# Expenses

[← Docs index](../README.md) · Related: [Owner balances](owner-balances.md) · [Banking](banking.md) · [Tax rules](../tax-rules.md)

**Routes** `/expenses`, `/expenses/new`, `/expenses/[id]`
**Files** `web/src/app/(app)/expenses/**`, `web/src/components/expenses/*` (`expense-form.tsx`, `expense-list.tsx`, `math.ts`, `server.ts`, `filters.tsx`, `category-*.tsx`)
**Data** `expenses`, `expense_overview`, `attachments`, `fx_rates`, `categories`, `money_accounts`

## The model: who · what · how · why
Every expense records **who spent** (`spent_by`), **what on** (vendor, category, project),
**how it was paid** (`paid_from_account_id`: Business Card, EQ Bank, or an owner's *personal*
account) and **what it was for** (`nature`):

| Nature | Paid with business money | Paid with personal money |
|---|---|---|
| Business | Normal expense | Expense **+ company owes the owner** |
| Personal | Not an expense → **owner owes the company** (shareholder loan) | Not recorded |
| Mixed (business %) | Business % is an expense; personal % → owner owes company | Business % is an expense and owed to the owner |

`expense_overview` derives `deductible_cad` (business share × category deductible %) and `itc_cad`
(GST/HST × business share × deductible %). Capital categories (`is_capital`) go to CCA, not expenses.

## List (`/expenses`)
Tabs `?filter=all|no-receipt|to-settle|personal`; filters who / paid with / category / period / tag;
`?q=` search; sort (date, vendor, amount). Totals strip: total, deductible (+capital), ITCs, missing receipts.
Phones: month groups with totals; desktop: dense table (date, vendor, category, who, paid with,
nature, total, ITC, receipt) with a sticky header.

## New expense (`/expenses/new`, `?scan=1`, `?from=<id>`)
Order is tuned for one hand: big amount (CAD/USD toggle) → receipt (Take photo / Add file) → vendor
with autocomplete that **pre-fills** category, nature/%, paid-with, tax preset and project from the
vendor's last expense → date → category sheet → who spent → paid with → business/personal/mixed
(slider) with a live plain-English consequence line → sales tax presets (BC goods GST+PST, GST 5%,
HST 13%, none/foreign) that back-calculate from the total → project, billable, tags, notes.
Sticky **Save** / **Save & add another**. Duplicate warning (same vendor+amount ±3 days).
USD uses the Bank of Canada rate for the date (Valet API, walks back up to 7 days, cached in `fx_rates`).
Closed periods (`lock_books_before`) are blocked.

## Detail (`/expenses/[id]`, `?edit=1`)
Receipt gallery, tax-treatment card (CAD total, business %, deductible %, deductible, ITC, CCA note),
settlement status with s.15(2) repay-by date, bank match, activity; Duplicate, Delete, Mark settled (undo).
