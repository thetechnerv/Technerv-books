# Decision log

[← Docs index](README.md)

Newest first. Add a line whenever behaviour, scope or an assumption changes.

## 2026-10-02 — PWA
- Installable home-screen app: full manifest + shortcuts, generated icons/maskable/splash screens for
  16 Apple devices, privacy-first service worker (static assets only, offline page), update toast,
  offline pill, pull-to-refresh in standalone mode, Settings → Install on your phone, Home install hint.
- **Security fix**: the dev sign-in bypass now only applies to `localhost` requests (the dev server
  listens on the LAN); `DEV_BYPASS_ALLOW_LAN=1` opts in for phone testing on trusted Wi-Fi.
- Security headers added (nosniff, SAMEORIGIN, referrer, permissions); `distDir` overridable via
  `NEXT_DIST_DIR` so a production build can run beside the dev server.

## 2026-10-02 — Documentation pass
- Created `docs/` (this set) and `docs/user-guide.html` (how to use the app day to day).
- Fixed the expenses desktop table: its sticky header sat inside an `overflow-hidden` card with a
  hard-coded `top: 52px`, so it overlapped the month label and first row. `Page` now publishes
  `--sticky-top`; expenses, invoices and clients tables use it and `overflow-clip`.

## 2026-10-02 — Integration & QA
- Six areas built in parallel (invoices/PDF, expenses/balances, banking, tax/reports/documents,
  settings/search, clients/projects) against `web/DESIGN.md`, then integrated.
- Shared fixes: base CSS moved into `@layer base` (inputs ignored font sizes); custom classes became
  `@utility` (so `lg:material-bar` works); `cn()` uses tailwind-merge; editors hide the tab bar;
  chips auto-scroll to the selected one; menus scroll; segmented controls shrink; grids use
  `minmax(0,1fr)`; `fiscalYearOf` counts the year-end day in the closing year; Home spending =
  business share net of ITCs, no capital, plus mileage (matches Reports).
- Sample data: short first fiscal year (53-week rule); FY2025 personal shares repaid at year-end;
  project status fix; activity summaries include file names; 2026 mileage rates (73¢ / 67¢).
- Server action body limit raised to 4 MB (large CSV imports).

## 2026-10-02 — Green light & foundation
Owner answers: fiscal year-end **Sept 30** ("I think" — may change), GST **annual**, members
Gursahib Singh and Deeparsh Singh (50/50 assumed), **view/download PDFs and send them manually** (no
email sending), **CSV** for bank and card, no US clients yet (support USD anyway), hosting later,
no existing invoice sequence (start at 1001), use **lots of synthetic data and keep it** until a
go-live fresh start, compressed file storage, invoices must carry the logo/palette/Apple look,
a proper Settings page, lots of quality-of-life options.

Technical decisions:
- **Next.js 16 + Supabase**; all objects in schema `accounts` so other internal tools can share the
  project; harness via Management API (no DB password needed).
- **Server-side data access** (server components + server actions) so RLS applies to the user's
  session and the dev bypass is a single switch.
- **Email OTP**, sign-ups disabled, membership by email.
- **Files in Storage, not in Postgres rows**; compression in the browser (WebP/gzip).
- **PDFs rendered on demand** with react-pdf + Inter; revisions re-render from JSON snapshots.
- **EQ Bank**: no public API → CSV first; Plaid's free Trial (10 live connections, transactions +
  balances) is the future option, pending a test with a real EQ business login. Canada's open
  banking (Consumer-Driven Banking Act) only obliges the Big Six for now.
- Hosting: Vercel Hobby forbids commercial use → Netlify/Cloudflare free or Vercel Pro (undecided).

## 2026-10-02 — Research & plan
- Brand read from technerv.com (mint `#03DDAA`, teal, ocean, ink `#0C1113`, Inter).
- Plan proposed and approved: invoices, payments, expenses with who/how/nature, owner balances,
  bank import + review, Tax Centre, reports, documents, settings, ⌘K search, mobile-first Apple UI.

## Open questions for the owners
- Confirm fiscal year-end (Sept 30?) and the real incorporation / GST registration dates.
- Real BN, GST number, address, bank details (sample values are placeholders).
- Ownership split if not 50/50.
- Which bank issues the business card (to tune its CSV preset).
- A real EQ Bank CSV export to verify the import preset.
- Accountant review of GIFI mapping, 11% tax estimate, foreign-vendor GST.
