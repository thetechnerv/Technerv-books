# Clients & projects

[← Docs index](../README.md) · Related: [Invoices](invoices.md) · [PDF](pdf.md)

**Routes** `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/projects/[projectId]`, `GET /api/clients/export`, `GET /api/clients/[id]/statement`
**Files** `web/src/app/(app)/clients/**` (actions in `actions.ts`), `web/src/components/clients/*`
**Data** `clients`, `projects`, plus invoices/payments/expenses for KPIs

## List
Filters `?filter=active|owing|archived`, search, sort (name, outstanding, last invoice, lifetime billed).
Phones: A–Z groups with initials tiles; desktop: table (location, tax, open, overdue, billed FY,
last invoice, avg days to pay). Header: total outstanding, clients with balances.

## Create / edit
Tax treatment derived live from province/country (`components/clients/tax.ts`) with override;
country → currency (US → USD); email/CC/postal validation and formatting ("V2C 1T8"); duplicate-name warning.

## Client page
Contact actions (Call, Email, Copy address, Maps), tax/currency/terms chips, KPIs (lifetime billed,
outstanding, overdue, average days to pay, last payment), quick actions (New invoice, New estimate,
Record payment, Duplicate last), invoices/estimates/credits, payments, projects with budget bars,
autosaving notes, statement card (view/download/share), archive with undo (confirm only if open invoices).

## Projects
Status lead/active/paused/done, budget, dates. Project page: billed vs budget, profitability
(revenue − tagged expenses − mileage), invoices, **Unbilled expenses** → "Invoice these" link
(`/invoices/new?client=&project=&expenses=`). Delete only when nothing is attached.
