# Invoices, estimates, credit notes & recurring

[← Docs index](../README.md) · Related: [PDF](pdf.md) · [Payments](payments.md) · [Clients](clients.md)

**Routes** `/invoices`, `/estimates`, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/edit`, `/invoices/recurring`
**Files** `web/src/app/(app)/invoices/**`, `web/src/app/(app)/estimates/**`, `web/src/components/invoices/*`
**Data** `invoices`, `invoice_lines`, `invoice_revisions`, `recurring_invoices`, `items`, `tax_rates` · migrations 0010–0012

## Lists
- `/invoices` = kind invoice + credit_note. Filters `?filter=all|outstanding|overdue|draft|paid`, `?q=` (number, client, title). Summary: outstanding (CAD), overdue, paid this FY vs last. Overdue view adds age chips (1–30 / 31–60 / 61–90 / 90+).
- `/estimates` = Draft · Sent · Accepted · Declined, valid-until, "Invoiced as TN-…", win rate.
- Phones: month groups; desktop: sortable table (sticky header at `--sticky-top`), copy-number, inline Convert.
- New menu: invoice, estimate, credit note, "Duplicate last invoice…", Recurring.

## Editor (`/invoices/new`, `/invoices/[id]/edit`)
Query params: `kind=invoice|estimate|credit_note`, `client`, `project`, `from=<id>` (duplicate),
`expenses=<id,id>` (one line per billable expense at pre-tax CAD; saving sets `expenses.billed_invoice_id`).

- Client picker shows tax treatment; currency + per-line tax default from the client (place of supply).
- Project filtered by client; due-date presets from client terms / `default_terms_days`; estimates use `estimate_valid_days`.
- Catalogue quick-pick (`items`), detail line, qty, unit, price, per-line tax; reorder up/down; remove with undo.
- Live totals with tax per rate; discount applied **before** tax (pro-rated).
- Numbers from `next_document_number(kind)` → `TN-`, `EST-`, `CN-` (credit notes share the invoice sequence).
- Lines saved atomically via `replace_invoice_lines()`. Totals always come from triggers.
- Editing an issued invoice asks "What changed?" → snapshot to `invoice_revisions` (`invoice_snapshot()`), `revision + 1`.
- `lock_books_before` blocks edits dated in a closed period. ⌘S saves. Phones: sticky bottom bar (tab bar hidden).

## Detail (`/invoices/[id]`)
Hero (amount due, status, due/overdue), in-app PDF viewer (pdf.js canvas), actions:
Download, Share (Web Share with the PDF file on phones), Open in new tab, Edit, Duplicate,
Record payment, Mark sent / back to draft, Void, Convert estimate → invoice (`converted_from`),
Accept / Decline, Create credit note, **Copy reminder** (sets `last_reminded_at`),
**Save PDF copy to records** (stored at `invoices/<year>/<number>-r<rev>.pdf`).
Timeline (created, sent, payments, revisions with reasons, reminders); revisions list with PDF of any revision.
Desktop keys: D download · P record payment · R copy reminder · ⇧E edit.

## Recurring (`/invoices/recurring`)
Schedules per client (frequency, next run, active). **Create due drafts** copies the last invoice's
lines for that schedule with month names updated and advances `next_run_on`. No cron — on demand.

## Status rules
`draft → sent → partial → paid` (paid/partial maintained by `payment_allocations` triggers);
`void` any time; estimates `sent → accepted/declined`; credit notes show Issued / Applied.
Overdue = invoice, sent/partial, `due_date < today`.
