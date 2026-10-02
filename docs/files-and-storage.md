# Files & storage

[← Docs index](README.md) · Related: [Auth & security](auth-and-security.md)

Files live in the private Supabase Storage bucket **`accounts`** (25 MB per file limit). The
database only stores metadata in `accounts.attachments` (`entity_type`, `entity_id`, path, mime,
`size_bytes`, `original_size_bytes`, `compression`).

## Folder layout

| Prefix | Contents |
|---|---|
| `receipts/<year>/<expense id>/…` | Expense receipts |
| `documents/<year>/…` | Vault documents (statements, returns, contracts) |
| `invoices/<year>/<number>-r<rev>.pdf` | "Save PDF copy to records" snapshots (`invoices.archived_pdf_path`) |
| `bank/imports/<batch id>.csv.gz` | Original import files, gzipped server-side |
| `branding/logo-<timestamp>.<ext>` | Uploaded logo (`business_profile.logo_path`); **kept** by fresh-start |
| `payments/…` | Payment attachments (supported, unused so far) |

## Upload pipeline (`lib/compress.ts` → `lib/storage.ts`)

1. **Compress in the browser** (`prepareFile`):
   - Photos/scans → **WebP**, longest edge ≤ 2400 px, quality 0.82 (falls back to JPEG on Safari
     versions that can't encode WebP). Typically 80–95% smaller than a phone photo.
   - Text-like files (CSV, JSON, TXT > 2 KB) → **gzip** via `CompressionStream`.
   - PDFs / Office files are already compressed → stored as-is.
2. `createUpload()` server action returns a **signed upload URL** (no file passes through Next.js).
3. Browser uploads directly to Storage (`uploadToSignedUrl`).
4. `registerAttachment()` writes the `attachments` row (with original vs stored size).

The `Attachments` component (`components/files/attachments.tsx`) wraps all of this: thumbnails,
"Take photo" (rear camera on phones), "Add file", full-screen viewer, download, delete. The toast
reports how much compression saved. Settings → Data shows totals.

## Serving files

`GET /api/files?id=<attachment id>[&download=1]` — members only; un-gzips files stored with
`compression='gzip'`; inline or attachment disposition.

## Generated PDFs

Invoice, sample-theme and statement PDFs are rendered on request from data (always current).
Revisions re-render from their JSON snapshot. Only an explicit "Save PDF copy to records" stores a
PDF file. See [features/pdf.md](features/pdf.md).
