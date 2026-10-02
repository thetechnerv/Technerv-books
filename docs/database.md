# Database

[← Docs index](README.md) · Related: [Harness](harness.md) · [Auth & security](auth-and-security.md)

Supabase Postgres 17, project **TechNerv-Internal** (`tuivualphpzoymnbtszc`). All app objects are in
schema **`accounts`**; the harness keeps its migration log in **`_harness.migrations`**.
Source of truth: `harness/migrations/*.sql`. Generated TypeScript types: `web/src/lib/database.types.ts`.

## Migrations

| File | What it adds |
|---|---|
| `0001_foundation.sql` | Enums, all core tables, invoice total/paid triggers, numbering, base views, RLS, `public_invoice()` |
| `0002_settings_revisions_storage.sql` | Global settings columns on `business_profile`, `invoice_revisions`, `import_batches`, `recurring_expenses`, email-based membership, activity triggers, view refresh, storage bucket + policies |
| `0003_other_income.sql` | `other_income` (interest, refunds…) + `bank_transactions.matched_income_id` |
| `0010_invoicing.sql` | Credit-note prefix (`CN-`, shares the invoice sequence), `invoice_lines.detail`, discount applied **before** tax, `replace_invoice_lines()`, `invoice_snapshot()`, recurring indexes |
| `0011_document_number_where.sql` | `next_document_number` with an explicit `WHERE` (Supabase blocks un-filtered updates) |
| `0012_replace_lines_fix.sql` | Fix to `replace_invoice_lines` |
| `0030_expenses_balances_mileage.sql` | `settlement_transfer_id` on expenses/trips, `round_trip`, `reimbursed_on`, subscription PST/project/notes, `fiscal_year_end_on()`, `shareholder_loan_repay_by()`, `mileage_rate_for()`, `member_ledger` view, `on_transfer_delete` |
| `0040_banking.sql` | Review metadata (`note`, `rule_id`, `auto_matched`, `reviewed_by/at`), import file path/format, `normalise_bank_description()`, `bank_dedupe_hash()`, `best_rule()`, `apply_rules_to_unreviewed()`, `undo_import()`, `account_balance_at()`, `reconciliations` |
| `0050_tax_documents.sql` | `documents.account_id/period_start/period_end` + type check; `tax_filings` filed-document link, worksheet JSON, `filed_by`, `created_at` |
| `0060_settings_export.sql` | `export_tables()` — the table list used by Settings → Export everything |
| `0070_activity_summary.sql` | `log_activity()` also uses `file_name`, `source`, kind+amount for summaries |

Reserved ranges (from the parallel build): 0010–0019 invoicing, 0020–0029 clients, 0030–0039
expenses, 0040–0049 banking, 0050–0059 tax, 0060–0069 settings, 0070+ shared/integration.

## Enums

| Enum | Values |
|---|---|
| `money_account_kind` | bank, credit_card, cash, personal, payment_processor |
| `invoice_kind` | invoice, estimate, credit_note |
| `invoice_status` | draft, sent, partial, paid, void, accepted, declined |
| `payment_method` | etransfer, eft, wire, cheque, card, cash, stripe, other |
| `expense_nature` | business, personal, mixed |
| `bank_txn_status` | unreviewed, matched, created, ignored |

## Tables

### Company & people
| Table | Purpose / notable columns |
|---|---|
| `business_profile` | **Single row** (`id boolean = true`). Legal/operating name, BN, GST number, address, fiscal year-end `MM-DD`, GST filing period, quick method, invoice/estimate/credit-note prefixes and next numbers, default terms, payment instructions, e-Transfer email, bank details, invoice theme/accent/logo/thank-you/footer, mileage rates, receipt threshold, shareholder-loan alert days, `lock_books_before` |
| `members` | The owners. `email` drives sign-in membership; `user_id` links to `auth.users`; `ownership_pct`, `color`, `initials`, `preferences` |
| `money_accounts` | Where money lives or moves: EQ CAD, EQ USD, Business Card, and one **personal** account per member (`is_business=false`, `owner_member_id`). `csv_mapping` JSON for imports |

### Sales
| Table | Purpose |
|---|---|
| `clients` | Billing details, currency, `default_tax_rate_id` (derived from place of supply), terms, CC emails, notes, archived |
| `projects` | Per client: status (lead/active/paused/done), budget, dates |
| `items` | Product/service catalogue used by the invoice editor |
| `invoices` | All three kinds. Totals (`subtotal`, `tax_total`, `total`) are **trigger-maintained**; `amount_paid` and status from allocations; `balance` is generated. `revision`, `archived_pdf_path`, `converted_from`, `recurring_id`, `share_token`, `last_reminded_at` |
| `invoice_lines` | `amount` generated (`qty × unit_price`), per-line `tax_rate_id`, `detail`, `unit` |
| `invoice_revisions` | JSON snapshot `{invoice, lines, client}` per revision + reason |
| `recurring_invoices` | Schedule per client (frequency, `next_run_on`, active) |
| `payments` | Money received: method, deposit account, reference, FX rate |
| `payment_allocations` | Payment ↔ invoice amounts (many-to-many) |
| `other_income` | Non-invoice income (bank interest, refunds) |

### Spending
| Table | Purpose |
|---|---|
| `expenses` | `spent_by` member, `paid_from_account_id`, `nature` + `business_pct`, `subtotal/gst_hst/pst/total`, `currency` + `fx_rate` → `total_cad` (generated), category, project, billable/`billed_invoice_id`, `settled`/`settled_on`/`settlement_transfer_id`, tags, `source` (manual/bank_import/receipt_scan/recurring), `bank_transaction_id` |
| `recurring_expenses` | Subscriptions: amount, currency, frequency, `next_on`, who/how paid |
| `member_transfers` | Owner ↔ company money: reimbursement, repayment, contribution, dividend, salary, other |
| `mileage_trips` | Date, from/to, purpose, km, `round_trip`, `rate_per_km` (stored at save time), reimbursed |

### Banking
| Table | Purpose |
|---|---|
| `bank_transactions` | Imported rows: signed `amount` (+in/−out), `balance_after`, `dedupe_hash` (unique per account), status, `matched_*_id` links, `rule_id`, review metadata, `import_batch` |
| `import_batches` | One CSV/QFX import: file name, counts, date range, stored original file path |
| `rules` | `match_text` (contains, case-insensitive) → vendor rename, category, nature, project; `priority`, `times_applied` |
| `reconciliations` | Account + period end + statement balance + who/when |

### Tax & records
| Table | Purpose |
|---|---|
| `tax_rates` | GST, HST-ON/NS/NB/NL/PE, PST-BC, ZERO, EXEMPT (`rate`, `kind`, `is_recoverable`) |
| `categories` | Income/expense categories with **GIFI code**, `deductible_pct` (meals = 50), `is_capital` + `cca_class`, icon, colour, sort |
| `tax_filings` | GST/T2/other filings: period, due, filed date, confirmation, amount, paid, worksheet JSON, filed document |
| `documents` | Vault entries (type, fiscal year, issued/expires, account + period for statements) |
| `attachments` | Files for any entity (`entity_type` + `entity_id`): storage path, mime, size, original size, compression |
| `fx_rates` | Bank of Canada rates cache (`currency`, `rate_date`, `rate_to_cad`) |
| `activity_log` | Written by triggers on the main tables (member, entity, action, summary) |

## Views

| View | What it computes |
|---|---|
| `invoice_overview` | Invoice + client/project names, `is_overdue`, `days_overdue`, `total_cad`, `last_payment_on` |
| `expense_overview` | Expense + names, `attachment_count`, `effective_business_pct` (0 for personal), **`deductible_cad`** (business share × category deductible %), **`itc_cad`** (GST/HST × business share × deductible %, i.e. meals ITC is also 50%) |
| `member_balances` | One row per member, **positive = company owes the member**: business share paid with personal money (+), personal share paid with business money (−), mileage (+), contributions (+), repayments (+), reimbursements (−) |
| `member_ledger` | The same movements as rows with dates, labels, running context and **`repay_by`** for shareholder-loan items |

## Functions & triggers

| Function | Role |
|---|---|
| `recalc_invoice(id)` / `on_line_change` / `on_invoice_discount_change` | Recompute subtotal, tax (per line rate, discount pro-rated before tax), total |
| `recalc_invoice_paid(id)` / `on_allocation_change` | `amount_paid` + status (sent ↔ partial ↔ paid) |
| `next_document_number(kind)` | Atomically hand out `TN-####`, `EST-####`, `CN-####` |
| `replace_invoice_lines(id, jsonb)` | Editor saves all lines in one transaction |
| `invoice_snapshot(id)` | JSON for `invoice_revisions` |
| `current_member_id()` / `is_member()` | Membership by `auth.uid()` **or** JWT email — used by every RLS policy |
| `log_activity()` | Activity trigger on invoices, payments, expenses, clients, transfers, trips, documents, imports, subscriptions, projects, other income |
| `touch_updated_at()` | `updated_at` on invoices/expenses |
| `fiscal_year_end_on(date)` | FY end date containing a date (reads `business_profile.fiscal_year_end`) |
| `shareholder_loan_repay_by(date)` | s.15(2): end of the fiscal year after the one the loan arose in |
| `mileage_rate_for(member, date, km, exclude)` | Blended CRA two-tier rate (first 5,000 km per calendar year) |
| `on_transfer_delete` | Re-opens the expenses/trips a deleted settlement covered |
| `normalise_bank_description`, `bank_dedupe_hash` | Duplicate detection (mirrors the TypeScript importer) |
| `best_rule`, `apply_rules_to_unreviewed` | Rule suggestions for the review queue |
| `undo_import(batch)` | Removes unmatched rows of an import |
| `account_balance_at(account, date)` | Opening balance + imported amounts to a date (reconcile) |
| `export_tables()` | Tables included in Export everything |
| `public_invoice(token)` | Read-only invoice JSON for a future client link (granted to `anon`; currently unused) |

## Row-level security

Every table has RLS enabled with one policy, `members_all`, for role `authenticated`:
`using (accounts.is_member()) with check (accounts.is_member())`. `anon` has no table grants.
Storage bucket `accounts` has the same rule for select/insert/update/delete. See
[auth-and-security.md](auth-and-security.md).

## Conventions

- Money: `numeric(14,2)`; FX `numeric(12,6)`; CAD amounts derived as `amount × fx_rate`.
- Signs: bank amounts **+ in / − out**; member balances **+ = company owes member**.
- Never write invoice totals or `amount_paid` from the app — triggers own them.
- Dates are `date` (local business dates), timestamps `timestamptz`.
