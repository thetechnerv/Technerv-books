# Banking: imports, review, rules, reconcile

[← Docs index](../README.md) · Related: [Expenses](expenses.md) · [Payments](payments.md)

**Routes** `/banking`, `/banking/[accountId]`, `/banking/[accountId]/reconcile`, `/banking/import?account=`, `/banking/review`, `/banking/rules`, `GET /api/banking/imports/[id]`
**Files** `web/src/app/(app)/banking/**` (`_lib/data.ts`, `_lib/review.ts`, per-route `actions.ts`), `web/src/components/banking/*` (`csv.ts`, `import-wizard.tsx`, `review-queue.tsx`, `review-sheets.tsx`, `rules-manager.tsx`, `reconcile-view.tsx`, `txn-list.tsx`)
**Data** `bank_transactions`, `import_batches`, `rules`, `reconciliations`, `other_income` · migration 0040

EQ Bank has no free API, so the feed is **CSV** (and OFX/QFX). Plaid is the future option ([roadmap](../roadmap.md)).

## Accounts (`/banking`)
Cards for EQ CAD, EQ USD, Business Card (balance from latest `balance_after`, last import, to-review count, Import),
import history (download the original file, **Undo import** = `undo_import()` removes unmatched rows).

## Import wizard
1. Account + file (works with the iPhone Files app).
2. Parse (`papaparse`), auto-detect preset or map columns. Presets: **EQ Bank** (`Transfer date, Description, Amount, Balance` — inferred, verify with a real export), **Debit/Credit**, **Signed amount**, **Custom**; mapping saved to `money_accounts.csv_mapping`. Dates auto-detected (9 formats); amounts tolerate `$`, commas, parentheses, CR/DR, Unicode minus. Card files with positive purchases are flipped.
3. Duplicates: `dedupe_hash` = sha256(account|date|amount|normalised description), identical in TS and SQL; overlap with earlier batches is flagged.
4. Import: batch row, unreviewed rows, rules applied (`best_rule`), confident single matches auto-matched; original file gzipped to `bank/imports/<batch>.csv.gz`.

Test files: `harness/seeds/sample/csv/` (EQ Sept 2026 with duplicates, card debit/credit, card signed, EQ USD QFX).

## Review queue (`/banking/review`)
One transaction at a time with suggestions: matching expenses (±$0.02, ±5 days, same account),
payments, owner transfers, other income, own-account transfer pairs, and the rule suggestion.
Actions: **Match**, **Create expense** (pre-filled from rule; links `bank_transaction_id`),
**Record income**, **Client payment** (creates payment + allocation), **Transfer** (both sides), **Ignore**.
Phones: swipe right = accept top suggestion, left = ignore (spring physics, velocity projection), undo toast, progress bar.
Desktop: list + detail with keys j/k move · m match · e expense · p payment · r income · t transfer · i ignore · u undo.
After categorising: "Always do this for …?" → new rule.

## Rules (`/banking/rules`)
Contains-match text → vendor rename, category, nature, project, priority; live "Test" count; apply to unreviewed.

## Reconcile
Pick a month, enter the statement closing balance; app balance = `account_balance_at()`; difference must be 0 or explained with a note; saved to `reconciliations`. Card balance entered as amount owing.
