# Tech Nerv Accounts — documentation

> Engineering notes for the people (and AI sessions) who build and maintain this app.
> The **user guide** for day-to-day use is a separate page: [user-guide.html](user-guide.html).

Last updated: **2026-10-02** · Status: **v1 complete, running on synthetic sample data**

## What this is

An internal accounting web app for **Tech Nerv Solutions Inc.** — a BC corporation in Kamloops with
two 50/50 owners (Deeparsh Singh, Gursahib Singh) and one business credit card. It replaces
QuickBooks/Zoho-style tools with something built around exactly how the company works:

- Issue branded **invoices / estimates / credit notes** as PDFs, record **payments** manually.
- Track every **expense**: who spent, what on, how it was paid, business vs personal vs mixed.
- Keep a running **owner balance** (who owes whom, shareholder-loan rules).
- Import **EQ Bank and card CSVs**, review and reconcile.
- Produce a **GST/HST return worksheet** and a **T2 year-end package** for the accountant.

Key facts the code assumes: fiscal year-end **Sept 30** (FY2026 = Oct 1 2025 – Sep 30 2026),
GST/HST filed **annually** on the regular method, base currency **CAD**, timezone **America/Vancouver**.

## Start here

| If you want to… | Read |
|---|---|
| Run the app or the database tools | [Getting started](getting-started.md) |
| Understand how the pieces fit | [Architecture](architecture.md) |
| Know every table, view, trigger, function | [Database](database.md) |
| Run migrations, tests, sample data, go-live reset | [Harness](harness.md) |
| Build UI that matches the rest | [Design system](design-system.md) (+ the build brief in [`web/DESIGN.md`](../web/DESIGN.md)) |
| Understand sign-in, RLS, the dev bypass | [Auth & security](auth-and-security.md) |
| Understand uploads, compression, PDFs on disk | [Files & storage](files-and-storage.md) |
| See what the demo dataset contains | [Sample data](sample-data.md) |
| Check the Canadian tax logic and its sources | [Tax rules & assumptions](tax-rules.md) |
| See what was decided, when, and why | [Decision log](decisions.md) |
| Find known gaps and what to build next | [Known issues & roadmap](roadmap.md) |

## Features

Each page explains what the feature does, the routes, the files, the data it touches and the
non-obvious logic.

| Area | Doc | Routes |
|---|---|---|
| Home dashboard | [features/home.md](features/home.md) | `/` |
| Invoices, estimates, credit notes, recurring | [features/invoices.md](features/invoices.md) | `/invoices`, `/estimates`, `/invoices/recurring` |
| Invoice & statement PDFs | [features/pdf.md](features/pdf.md) | `/api/invoices/*/pdf`, `/api/clients/*/statement` |
| Payments received | [features/payments.md](features/payments.md) | `/payments` |
| Clients & projects | [features/clients.md](features/clients.md) | `/clients` |
| Expenses | [features/expenses.md](features/expenses.md) | `/expenses` |
| Owner balances & shareholder loans | [features/owner-balances.md](features/owner-balances.md) | `/balances` |
| Subscriptions & mileage | [features/subscriptions-mileage.md](features/subscriptions-mileage.md) | `/subscriptions`, `/mileage` |
| Banking: CSV import, review, rules, reconcile | [features/banking.md](features/banking.md) | `/banking/*` |
| Tax Centre: readiness, GST/HST, year-end | [features/tax-centre.md](features/tax-centre.md) | `/tax/*` |
| Reports & exports | [features/reports.md](features/reports.md) | `/reports/*` |
| Documents vault | [features/documents.md](features/documents.md) | `/documents` |
| Settings | [features/settings.md](features/settings.md) | `/settings/*` |
| Search (⌘K) & navigation shell | [features/search-and-shell.md](features/search-and-shell.md) | global |
| Home-screen app (PWA) | [features/pwa.md](features/pwa.md) | `/settings/install`, `/manifest.webmanifest`, `/sw.js` |

## Repository map

```
TechNerv-Accounts-Manager/
├── README.md              quick start (points here)
├── docs/                  ← you are here (+ user-guide.html, samples/)
├── harness/               Supabase tooling: migrations, seeds, tests, CLI
│   ├── bin/db.mjs         the harness CLI
│   ├── migrations/        numbered SQL migrations (never edit applied ones)
│   ├── seeds/             reference data + synthetic sample generator
│   └── tests/             SQL tests run in rolled-back transactions
└── web/                   Next.js 16 app
    ├── DESIGN.md          the build brief every feature followed
    └── src/
        ├── app/(app)/     signed-in screens (one folder per area)
        ├── app/api/       PDFs, exports, files, search
        ├── components/    ui/ (design system), shell/, and one folder per area
        └── lib/           db client, session, formatting, finance, fiscal helpers
```

## Ground rules for future work

1. **Never delete the sample data** unless the owners ask for the go-live "fresh start"
   (`npm run db -- fresh-start --yes` in `harness/`). See [Sample data](sample-data.md).
2. Database changes go in a **new numbered migration**, then `npm run db -- types`.
3. Reuse `web/src/components/ui/*` — don't invent new buttons, sheets or lists.
4. Every UI change is checked at **375 px (phone)** and **≥1280 px (desktop)**, in light and dark.
5. Server actions start with `await currentMember()` and return `ActionResult`.
6. Keep this documentation current: update the relevant feature page and add a line to
   [decisions.md](decisions.md) when you change behaviour.
