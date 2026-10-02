# Sample data

[← Docs index](README.md) · Related: [Harness](harness.md)

The database currently holds a **synthetic, fictional** dataset so every screen shows realistic
activity. The owners asked to **keep it** until they request a fresh start before going live.

## How it's built

`npm run db -- sample` runs, in one transaction:

1. `seeds/sample/generate.mjs` — deterministic generator (fixed PRNG seed; same output every run).
   It **truncates** transactional tables first, then writes the books for FY2025, FY2026 and the
   first two days of FY2027 ("today" = **2026-10-02**). Invoice numbers are assigned chronologically.
2. Every `seeds/sample/*.sql` in name order (feature extras, idempotent):

| File | Adds |
|---|---|
| `10-invoicing.sql` | Line detail text, recurring links, estimate terms |
| `20-clients.sql` | CC emails, notes, a lead project, an archived client (Sun Peaks Adventure Co.) |
| `30-expenses.sql` | Settlement links, round trips, subscription PST, one example of each expense case |
| `31-yearend-repayments.sql` | FY2025 year-end repayment of personal shares (so no loan is past its s.15(2) date) |
| `40-banking.sql` | Rule suggestions on the review queue, August 2026 reconciled |
| `50-tax.sql` | Statement linked to EQ Bank, filed returns linked to documents |

3. Uploads ~150 SVG receipts and 12 placeholder PDFs (`seeds/sample/files.mjs`) to Storage.
   `--no-files` skips this step.

Rows created while testing features (e.g. TN-1092 partly paid on revision 2, EST-1012 → TN-1093,
TN-1094 recurring draft, TN-1095 void, a few expenses) are also part of the demo now.

## What's in it

| Area | Contents |
|---|---|
| Company | Tech Nerv Solutions Inc., Kamloops; **placeholder** BN `700000000`, GST `700000000 RT0001`, BC1400000, EQ bank details |
| Fiscal years | Short first year Aug 15 – Sep 30 2024 (nil returns), FY2025, FY2026 (just closed), FY2027 started |
| Clients | 10 fictional businesses: Kamloops/Kelowna/Vernon/North Van (GST), Calgary (GST), Toronto (HST 13%), Halifax (HST 14%), Seattle (USD, zero-rated) + 1 archived |
| Invoices | ~95 invoices, 12 estimates, 1 credit note; builds (estimate → 50% deposit → completion), monthly retainers, hourly work; 4 overdue, 1 partly paid, drafts, a void |
| Payments | e-Transfer, EFT, wire (USD), cheque; one split payment |
| Expenses | ~385: USD and CAD subscriptions, meals (50%), travel, equipment (capital), professional fees, subcontractors, mixed phone/internet, personal charges on the business card |
| Accounts | EQ Bank Business (CAD), EQ Bank Business USD, Business Card, a personal account per owner |
| Bank feed | ~460 imported rows, 16 left to review, card bill payments as transfers, monthly interest as other income |
| Owners | Start-up loans, quarterly reimbursements, mileage reimbursements, repayments |
| Other | 34 mileage trips, 11 subscriptions, 15 rules, 12 documents, 7 tax filings, activity history |

## Going live

```bash
cd harness && npm run db -- fresh-start --yes
```

Deletes every transactional record and stored file (except `branding/`), resets numbering to 1001,
keeps settings, members, money accounts, categories, tax rates. Afterwards, replace the placeholder
company details in Settings → Company and Branding. **Never run this without the owners asking.**

To rebuild the demo from scratch at any time: `npm run db -- sample`.
