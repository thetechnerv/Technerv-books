# Reports & exports

[← Docs index](../README.md) · Related: [Tax Centre](tax-centre.md)

**Routes** `/reports`, `/reports/profit-loss`, `/reports/expenses`, `/reports/spending`, `/reports/revenue`, `/reports/ar-aging?asof=`, `/reports/cash-flow`; CSV at `GET /api/exports/<report>?…`
**Files** `web/src/app/(app)/reports/**`, `web/src/components/reports/*` (`data.ts`, `csv.ts`, `hbar-chart.tsx`, `pnl-table.tsx`, `report-frame.tsx`), period picker `components/tax/period-picker.tsx`

| Report | Shows |
|---|---|
| Profit & loss | Revenue and expenses by category; monthly columns on desktop; expandable categories |
| Expenses by category | Horizontal bars |
| Spending | By owner (business vs personal) and by payment account |
| Revenue by client | Billed per client in the period |
| AR aging | Current, 1–30, 31–60, 61–90, 90+ with invoice drill-down; `?asof=` |
| Cash flow | Money in vs out per month (`BarChart`); own-account transfers excluded |

Period picker: fiscal years + custom range. Expense definition matches Home and the Tax Centre
(business share net of ITCs, capital excluded, mileage included). Chart palettes validated with the
dataviz validator for light (`#ffffff`) and dark (`#111a1c`) surfaces.

Other exports: Settings → Data → **Export everything** (`/api/settings/export`, one CSV per table),
clients CSV (`/api/clients/export`), mileage logbook (`/mileage/export`), year-end zip.
