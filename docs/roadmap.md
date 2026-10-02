# Known issues & roadmap

[← Docs index](README.md)

## Go-live checklist

- [ ] Owners confirm they're happy with the demo → `npm run db -- fresh-start --yes`
- [ ] Replace placeholder company details (Settings → Company, Branding & invoices)
- [ ] Confirm fiscal year-end, GST period, ownership %, mileage rates
- [ ] Supabase custom SMTP (e.g. Resend) so sign-in codes reach Gmail
- [ ] Choose hosting (Netlify / Cloudflare free, or Vercel Pro); set env vars **without** `DEV_AUTH_BYPASS_EMAIL`
- [ ] Add production URL to Supabase Auth site URL + redirect allow-list
- [ ] Rotate the Supabase personal access token used during setup
- [ ] Import real opening balances (EQ CAD/USD, card) and the current fiscal year's statements
- [ ] Accountant review of categories/GIFI and tax flags

## Known issues

| Area | Issue |
|---|---|
| Banking | EQ Bank CSV preset (`Transfer date, Description, Amount, Balance`) is inferred, not documented by EQ — verify with a real export |
| Banking | Card rows without a balance column imported into the middle of history keep stale `balance_after` on later rows (reconcile uses sums, unaffected) |
| Banking | `import_batches.rows_matched` unused (counts computed on load) |
| Invoices | Credit notes are standalone ("Mark applied"); they don't reduce a specific invoice's balance |
| Invoices | Line reordering is up/down buttons (no drag) |
| Invoices | "Copy reminder" copies text only; attach the PDF yourself |
| Invoices | iOS Safari shows only page 1 of PDFs inside iframes (the in-app pdf.js viewer is unaffected) |
| Expenses | `?scan=1` may not auto-open the camera on iOS (needs a tap) — Take photo button is the fallback |
| Expenses | Mileage rate is fixed at save time; editing an earlier trip doesn't re-rate later ones across 5,000 km |
| Expenses | No supplier GST/HST number field yet (would automate the $100+ ITC documentation check) |
| Tax | Year-end zip is built in memory (fine at current volumes) |
| Tax | Statements tracker only has Sept 2026 EQ statement in the sample data |
| Routing | Missing-record pages show not-found UI but return HTTP 200 (loading.tsx streams first) |
| Settings | Server validation errors appear as a toast/banner rather than inline on the field |
| Settings | Replaced logos stay in storage (so Undo works) |

## Ideas / next steps

- **Plaid** connection for EQ Bank (free Trial: 10 live items) once a real business login is tested.
- **Receipt reading** with an AI model (vendor, date, total, GST) to pre-fill expenses from a photo.
- Client-facing invoice link using `public_invoice(token)` (already in the DB).
- Email sending (Resend) for invoices/reminders, if the owners want it later.
- Credit-note application to specific invoices.
- Recurring invoice/subscription automation on a schedule (currently on-demand buttons).
- PWA offline cache for read-only browsing; share-target to send receipts from the Photos app.
- Supplier GST number + vendor directory.
- Payroll/dividend helpers (T4/T5 slips) if the owners start paying themselves that way.
