# Tech Nerv Accounts

Internal accounting app for **Tech Nerv Solutions Inc.**: invoices and estimates, payments, expenses
(who spent, how it was paid, business / personal / mixed), owner balances, bank & card CSV imports,
mileage, subscriptions, a GST/HST and year-end Tax Centre, reports and a document vault.

```
web/       Next.js 16 app (App Router, Tailwind v4, Supabase) — installable PWA
harness/   Database tooling for the TechNerv-Internal Supabase project (schema `accounts`)
docs/      Engineering docs, the user guide and sample PDFs
```

**Documentation:** [docs/README.md](docs/README.md) (architecture, database, every feature, decisions, roadmap)
· **How to use the app:** [docs/user-guide.html](docs/user-guide.html)

## Run it locally

```bash
cd web && npm install && npm run dev
```

Open http://localhost:3000. `web/.env.local` is created by `node harness/bin/db.mjs web-env`.
In development, `DEV_AUTH_BYPASS_EMAIL` skips sign-in and acts as that member; production builds
ignore it and require the emailed one-time code (only the two members can sign in).

## Database harness

```bash
cd harness
npm run db -- help              # all commands
npm run migrate                 # apply migrations/*.sql in order
npm test                        # SQL tests (run inside rolled-back transactions)
npm run db -- sql "select * from accounts.member_balances"
npm run db -- types             # regenerate web/src/lib/database.types.ts
npm run db -- sample            # (re)load the synthetic demo dataset + receipt files
npm run db -- fresh-start --yes # go-live: delete every record and file, keep settings
```

- Never edit an applied migration; add the next numbered file.
- `harness/.env` holds a Supabase personal access token — keep it out of git.

## Sample data

The database currently holds **synthetic data** (fictional clients, ~100 invoices, ~380 expenses,
~460 bank/card transactions, receipts, mileage, filings) covering FY2025–FY2026 so every screen has
something to show. When you're ready to start for real, run `fresh-start --yes`: settings, members,
accounts, categories and tax rates are kept; everything else is removed.

Test CSVs for trying the import flow live in `harness/seeds/sample/csv/`.

## Before going live

- Set up custom SMTP in Supabase (Auth → SMTP, e.g. Resend) so sign-in codes reach the members' Gmail.
- Add the production URL to Supabase Auth redirect URLs and pick a host (Netlify / Cloudflare / Vercel Pro).
- Rotate the Supabase personal access token used during setup.
- Replace the sample company details (BN, GST number, address, bank details) in Settings → Company / Branding.
- Have your accountant confirm the GIFI category mapping and the tax treatments flagged in the Tax Centre.
