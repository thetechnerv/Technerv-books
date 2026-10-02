# Harness (database tooling)

[← Docs index](README.md) · Related: [Database](database.md) · [Sample data](sample-data.md)

`harness/bin/db.mjs` is a dependency-free Node CLI that talks to Supabase's **Management API**
(`POST /v1/projects/{ref}/database/query`) with a personal access token. It can run any SQL — DDL
or DML — without a direct Postgres connection.

```bash
cd harness
npm run db -- <command>       # or: node bin/db.mjs <command>
```

## Commands

| Command | What it does |
|---|---|
| `sql "<query>"` | Run any SQL and print rows as a table |
| `file <path.sql>` | Run a SQL file |
| `status` | List migrations as applied / pending / **changed** (checksum mismatch) |
| `migrate` | Apply pending `migrations/*.sql` in name order, each in a transaction, then `notify pgrst, 'reload schema'` |
| `seed [name]` | Run `seeds/*.sql` (reference data: company profile, tax rates, GIFI categories) |
| `test [name]` | Run `tests/*.sql`, each wrapped in `begin … rollback` — a test fails by raising |
| `tables` | App tables with approximate rows, size and RLS flag |
| `describe <table>` | Columns of a table |
| `expose` | Add `accounts` to PostgREST's exposed schemas |
| `keys` | Print URL + publishable key |
| `web-env` | Write `web/.env.local` (URL, publishable + secret keys, dev bypass email) |
| `types` | Regenerate `web/src/lib/database.types.ts` for schema `accounts` |
| `auth-setup` | Create an auth user for every active member, link `members.user_id`, **disable sign-ups**, set OTP expiry and redirect URLs |
| `sample [--no-files]` | Load the synthetic dataset: runs `seeds/sample/generate.mjs`, then every `seeds/sample/*.sql` in order, then uploads receipt/document files to storage |
| `fresh-start --yes` | **Go-live reset.** Truncates every transactional table and deletes stored files except `branding/`. Keeps settings, members, accounts, categories, tax rates. Resets invoice/estimate numbering to 1001 |
| `reset --yes` | Drop the whole `accounts` schema (destructive; only for rebuilding from scratch) |

## Writing migrations

1. Create `migrations/00NN_short_name.sql` with the next free number.
2. `npm run migrate`, then `npm run db -- types`.
3. If it changes behaviour, add a SQL test in `tests/` and update [database.md](database.md).
4. **Never edit an applied migration.** `status` flags edited files as *changed*; fix forward with a new file.

## Writing tests

Tests are plain SQL (usually a `do $$ … $$` block) that insert what they need and `raise exception`
on a wrong result. Everything runs inside a transaction that is always rolled back, so tests can't
damage data. Pin any settings the test depends on at the top (see `30_member_ledger.sql`, which pins
mileage rates).

| Test | Covers |
|---|---|
| `01_invoice_math.sql` | Line totals, HST, numbering, overdue flag, partial → paid → reverted |
| `02_member_balances.sql` | Personal-card business spend, personal on business card, mixed %, meals 50%, repayment |
| `30_member_ledger.sql` | Ledger sums to balances, repay-by dates, mileage tiers, transfer delete re-opens items |
| `40_banking.sql` | Dedupe hash parity, rules, undo import, balance at date |

## Smoke-testing routes

With the dev server running:

```bash
for r in / /invoices /expenses /banking/review /tax/gst /settings; do
  printf "%-24s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$r)"
done
```

## Secrets

`harness/.env` holds `SUPABASE_ACCESS_TOKEN` (full access to **every** project in the Supabase org)
and is git-ignored. Rotate it after setup work; see [auth-and-security.md](auth-and-security.md).
