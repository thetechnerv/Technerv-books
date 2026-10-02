# Invoice & statement PDFs

[← Docs index](../README.md) · Related: [Invoices](invoices.md) · [Clients](clients.md) · [Settings → Branding](settings.md)

**Files** `web/src/components/pdf/*` (`model`, `invoice-document`, `load`, `render`, `pdf-viewer`),
`web/src/components/clients/statement*.ts(x)`
**Routes**
- `GET /api/invoices/[id]/pdf?rev=<n>&download=1&archived=1`
- `GET /api/invoices/sample/pdf?theme=studio|midnight|minimal&accent=%23hex&logo=0|1` (live preview in Settings)
- `GET /api/clients/[id]/statement?from=&to=`

All members-only. Rendered with `@react-pdf/renderer` (`serverExternalPackages` in `next.config.ts`),
fonts Inter 400/500/600/700 from `node_modules/@fontsource/inter/files/*.woff`.

## Invoice design
- **Themes**: *Studio* (white, mint accent bar), *Midnight* (ink `#0C1113` header band, mint accents),
  *Minimal* (monochrome, accent only on balance due). Accent from `invoice_accent`.
- **Logo**: uploaded PNG/JPEG (`logo_path`) when `invoice_show_logo`, else the Tech Nerv mark drawn as SVG.
- Blocks: From (company, address, GST/HST no.), Bill to, meta grid (issued, due, PO, project), lines
  with detail text, totals with one line per tax rate ("GST 5% (BN …)", "HST 13% (ON)", "Zero-rated —
  export of services"), amount paid, **Balance due**, how to pay (instructions, e-Transfer, bank), notes,
  terms, thank-you line, footer with legal name/BN and "Page x of y".
- Variants: PAID / VOID / ACCEPTED stamps; estimate (valid until + acceptance line); credit note (negative);
  USD shown explicitly. Table header repeats across pages.
- Revisions render from the `invoice_revisions` snapshot (`?rev=`).

## Viewer
`pdf-viewer.tsx` renders pages to canvas with `pdfjs-dist` 6.3 at devicePixelRatio; the worker is
bundled by Turbopack via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
First render takes a moment while the PDF is generated.

## Statement of account
Opening balance, invoices / payments / credit notes with running balance, aging, open invoices,
closing balance due, payment instructions. Periods offered on the client page: FY, FY-to-date,
last 12 months, all time, custom.

Sample renders: `docs/samples/*.pdf`.
