# Tax Centre

[← Docs index](../README.md) · Related: [Tax rules & sources](../tax-rules.md) · [Reports](reports.md) · [Documents](documents.md)

**Routes** `/tax?fy=`, `/tax/gst?fy=|from=&to=`, `/tax/year-end?fy=`, `GET /api/exports/year-end?fy=`
**Files** `web/src/app/(app)/tax/**`, `web/src/components/tax/*` (`gst.ts`, `income.ts`, `books.ts`, `rules.ts`, `readiness.ts`, `period.ts`, `summary-pdf.tsx`, …)
**Data** `tax_filings` (+ worksheet JSON, filed document), invoices, expense_overview, other_income, member_ledger · migration 0050

Default fiscal year = the one that just closed if today is within 100 days of year-end.

## `/tax` — home
Key numbers (revenue, expenses, net income + estimated tax, GST/HST net), **Year-end readiness**
checklist (bank rows reviewed, receipts attached above threshold, no drafts in the FY, owner balances
reviewed ✓, mileage log, 12 statements per account in Documents, capital assets reviewed ✓, GST
return filed) with deep links; shareholder balances at year-end; **Deadlines** (add/edit; Mark filed
with date, confirmation, amount, paid date, optional filed return → Documents).

## `/tax/gst` — GST/HST return worksheet
GST34 lines 101–113C with **Copy** buttons (101 whole dollars). Hand-entered lines 104, 107, 110,
111 (+205/405) saved in the filing's worksheet and locked once filed. Breakdowns with drill-down
sheets: tax by rate/province, zero-rated exports, credit notes, other income, ITCs by category.
Checks: ITCs without receipts, $100/$500 documentation tiers, foreign vendors charging GST
(include/exclude switch), meals 50%, unusual tax codes. Instalment notice; quick-method view when enabled.

## `/tax/year-end` — T2 package
GIFI income statement (8299 / 9368 / 9970), add-backs, capital assets and CCA schedule (estimate),
estimated taxable income and 11% tax, shareholder loans, AR aging, GST summary, bank/card balances
and reimbursements at year-end; 53-week period warning.
**Download package** (zip, progress + cancel): CSVs (invoices, payments, expenses, GIFI summary,
capital assets, CCA, mileage, owner ledger, bank transactions, other income, GST return, balances),
`receipts/` (un-gzipped), one-page summary PDF, README.

## How numbers are computed
See [tax-rules.md](../tax-rules.md#gst34-return-annual-regular-method). FY2026 sample reconciles to SQL:
revenue 94,220.97 · line 103 6,821.02 · line 106 731.59 · line 109 6,089.43.
