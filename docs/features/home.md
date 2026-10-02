# Home dashboard

[← Docs index](../README.md)

**Route** `/` · **Files** `web/src/app/(app)/page.tsx`, `web/src/lib/finance.ts`, `web/src/components/charts/bar-chart.tsx`

## What it shows

| Block | Source |
|---|---|
| Greeting + date | `business_profile.timezone` |
| **Cash in bank** | `cashPositions()` — latest `balance_after` per bank account (+ opening balance); USD converted with `latestRate('USD')`; card owing shown separately |
| **Owed to you** | `receivables()` — open invoices (`sent`/`partial`) in CAD, overdue total and count |
| **GST/HST to remit** | `gstForFiscalYear()` — the year that just closed if we're < 100 days past year-end, else the current year |
| **Owner balances** | `member_balances` view (positive = company owes the owner) |
| **Needs attention** | Overdue invoices, unreviewed bank rows, business expenses without receipts (last 120 days), drafts, estimates awaiting reply, owners to reimburse — each deep-links to a filtered list |
| **Last 12 months** | `monthlySeries(12)`: revenue = invoices − credit notes, pre-tax, CAD; spending = business share **net of ITCs**, excluding capital, plus mileage (same definition as Reports) |
| **Upcoming deadlines** | Unfiled `tax_filings` by due date |
| **Recent activity** | `activity_log` (triggers) with member avatars and links |

Phone layout: stat cards scroll horizontally (snap), Needs attention comes before the chart, search
button and avatar (→ Settings) in the nav bar. Desktop: 4-column stats, 2-column body.

## Notes
- `daysSinceFyStart` decides which GST year to headline.
- The chart follows the dataviz rules: legend, hover tooltip per month, hidden data table for screen readers.
