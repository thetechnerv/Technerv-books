# Tech Nerv Accounts — build guide

Internal accounting app for **Tech Nerv Solutions Inc.** (BC corporation, Kamloops; two 50/50 owners:
Deeparsh Singh and Gursahib Singh). Goal: everything recorded and organised so the GST/HST return and the
T2 are easy. Fiscal year-end **Sept 30** (FY2026 = Oct 1 2025 – Sep 30 2026). GST/HST filed **annually**.
"Today" in the sample data is **2026-10-02**.

The bar: it should feel like an Apple designer with ten years of experience built it. Mobile-first
(iPhone in one hand: view, add, edit, invoice), and excellent on desktop.

## Stack & rules

- Next.js **16** App Router (`web/`). Read `web/node_modules/next/dist/docs/` before using an API you're unsure of.
  `params` / `searchParams` are **Promises** (`const { id } = await params`). Middleware is `src/proxy.ts`.
  No caching by default; after a mutation call `revalidatePath(...)` in the server action.
- Tailwind v4 with tokens in `src/app/globals.css` (no `tailwind.config`). **Never hardcode colours** — use tokens:
  `bg-bg bg-cell bg-elevated bg-inset bg-fill bg-fill-2 bg-fill-3`, `text-label text-label-2 text-label-3 text-label-4`,
  `text-accent-text bg-accent text-on-accent bg-accent-soft`, `text-red bg-red-soft`, `text-orange`, `text-blue`, `text-purple`,
  `border-separator`, `shadow-card shadow-pop`. Chart colours: `var(--chart-in)`, `var(--chart-out)`, `var(--chart-grid)`.
- Type scale classes (responsive, already tuned): `text-large text-title1 text-title2 text-title3 text-headline text-body
  text-callout text-subhead text-footnote text-caption text-caption2`. Money/numbers: add `tabular`.
- Radii: `rounded-group` for grouped lists/cards, `rounded-md` controls, `rounded-[14px]` big buttons on phones.
- Materials: `material-bar`, `material-thick`, `material-glass`, `material-sidebar`.
- Icons: `lucide-react`, stroke 1.8–2.2.
- Motion: `motion/react`. Springs, `bounce: 0`–`0.2`, `duration` 0.3–0.45. Respect reduced motion (globals handle CSS).

## Data

- Supabase project TechNerv-Internal, schema **`accounts`** (all tables have RLS = members only).
- Server-side only: `import { db, must } from '@/lib/db'` → `const supabase = await db()` (already bound to `accounts`).
  `must(await supabase.from('x').select())` throws on error. Types: `Row<'invoices'>`, `View<'expense_overview'>` from `@/lib/types`.
- `currentMember()`, `businessProfile()`, `allMembers()` from `@/lib/session` (request-cached).
- Shared finance helpers: `@/lib/finance` (`cashPositions`, `receivables`, `gstSummary`, `gstForFiscalYear`, `monthlySeries`, `latestRate`).
  Fiscal helpers: `@/lib/fiscal` (`fiscalYearOf`, `fiscalRange`, `fiscalLabel`). Formatting: `@/lib/format`
  (`money`, `date`, `shortDate`, `relativeDay`, `daysUntil`, `plural`, `bytes`, `isoToday`, `round2`, `num`).
- **Mutations** = server actions in a route-local `actions.ts` with `'use server'`. First line: `await currentMember()`.
  Return `ActionResult` (`{ ok: true, data? } | { ok: false, error }`) — never throw to the client. Validate input.
- Key schema facts (see `harness/migrations/*.sql`):
  - `invoices.kind` = invoice | estimate | credit_note; status draft/sent/partial/paid/void/accepted/declined.
    Totals are computed by triggers from `invoice_lines` (never write subtotal/tax_total/total yourself).
    `amount_paid`/`status` are maintained from `payment_allocations`. `balance` is generated.
    Numbers: `select accounts.next_document_number('invoice'|'estimate')` via `supabase.rpc('next_document_number', { p_kind })`.
  - `invoice_revisions` holds JSON snapshots (`{invoice, lines, client}`) for regenerating earlier PDFs.
  - `expenses`: `spent_by` (member), `paid_from_account_id` (money_accounts: bank / credit_card / personal), `nature`
    business|personal|mixed + `business_pct`. `expense_overview` adds `deductible_cad`, `itc_cad`, `attachment_count`, names.
  - `member_balances` view: positive = company owes the member. `member_transfers` kinds: reimbursement, repayment, contribution, dividend, salary, other.
  - `bank_transactions` (+ `import_batches`, `rules`, `other_income`), `mileage_trips`, `recurring_expenses`, `documents`,
    `attachments` (entity_type + entity_id), `tax_filings`, `fx_rates`, `activity_log`, `business_profile` (single row, all global settings).
- **Files**: `@/components/files/attachments` → `<Attachments entity="expense" entityId={id} items={rows} />` (compresses images
  to WebP, gzips text files, signed uploads, viewer). `uploadAttachment(file, entity, id)` for custom flows.
  View/download: `/api/files?id=<attachment id>[&download=1]`. Server-side generated files: `putServerFile` in `@/lib/storage`.
- **Schema changes**: add a new migration with your reserved number range, apply with `node harness/bin/db.mjs migrate`,
  then `node harness/bin/db.mjs types`. Never edit applied migrations. Never truncate/delete the sample data.
  Feature-specific sample rows go in `harness/seeds/sample/<range>-<area>.sql` (idempotent, run after the generator), and
  you apply them once with `node harness/bin/db.mjs file harness/seeds/sample/<file>.sql`.
- Harness: `node harness/bin/db.mjs sql "<query>"` to inspect data; `node harness/bin/db.mjs test` for SQL tests.

## Components (`src/components/ui`) — use these, don't re-invent

- `Page` — screen scaffold: `<Page title subtitle back={{href,label}} actions={…} toolbar={…} wide>`. Phones: iOS large
  title that collapses into a blurred bar; `toolbar` sticks under it (segmented filters, search). Desktop: slim toolbar.
- `Section` + `Row` + `IconTile` + `Card` (`group.tsx`) — inset grouped lists. `Section inset={58}` when rows have a 30px icon.
- `Button` (filled/tinted/gray/plain/destructive/outline; sm/md/lg; `href`), `IconButton`.
- `Sheet` + `SheetAction` — bottom sheet on phones (drag to dismiss), centered dialog on desktop. Use for create/edit forms
  and record-payment style tasks. Header: Cancel · Title · primary action.
- `Segmented` (controlled) and `LinkSegmented` (URL-driven filters).
- Fields (`fields.tsx`): `Input`, `TextArea`, `Select` (native picker), `Toggle`, `Switch`, `AmountInput` (big centred amount),
  `Chips`. Put fields inside `<Section>`.
- `Badge`, `StatusBadge status=… overdue`; `Avatar`; `Money`, `BigMoney`; `EmptyState`; `Menu` (pull-down from trigger);
  `useToast()` (`toast({ title, tone, action: { label: 'Undo', onClick } })`); `useConfirm()` (destructive only).
- `Skeleton`, `ListSkeleton` (`skeleton.tsx`) for `loading.tsx` files. `SearchField` (`@/components/shell/search-field`) opens the ⌘K palette.
- Charts: `@/components/charts/bar-chart` (`BarChart`). Follow the dataviz rules: legend for ≥2 series, thin bars, hairline grid,
  hover tooltip, sr-only table, colours from the chart tokens.
- Shell: `src/components/shell/*` (sidebar, floating glass tab bar, quick-add, nav config). Don't edit.

## UX rules

1. **Phones first.** 44pt minimum targets. Primary action reachable by thumb. Create/edit in a `Sheet` or a dedicated
   `/new` page with a sticky bottom bar. Numeric fields use `inputMode="decimal"`. Dates default to today.
2. **Lists**: grouped by month with small uppercase headers, each row = leading tile/avatar, title + subtitle, trailing
   amount (tabular) + status. Desktop may show a denser table (sticky header, hover rows, sortable columns).
3. **Filters** in one row under the title: `LinkSegmented` + search + a filter `Menu`. Keep filters in the URL.
4. **Empty states** with a clear next step. **Loading**: add `loading.tsx` skeletons for heavy routes.
5. **Forgiveness**: undo toasts for quick reversible actions; `useConfirm` only for destructive/irreversible ones.
   Closed books: respect `business_profile.lock_books_before` (block edits dated before it, explain why).
6. Copy: plain, specific, sentence case. "Record payment", not "Submit". Money always with currency when not CAD.
7. Keyboard on desktop: Enter submits sheets, Esc closes, ⌘S saves editors where it makes sense.
8. Every screen answers: where am I, what can I do, how do I get back.

## Working in parallel

Several people are building different areas at the same time in this folder.
- **Only edit files inside the folders you own.** Shared files (`components/ui`, `components/shell`, `lib/*`, `globals.css`,
  `(app)/layout.tsx`, `(app)/page.tsx`) are read-only for you. Put area-specific components in `src/components/<area>/`.
  If you truly need a shared change, describe it in your final report instead.
- A dev server is already running at **http://localhost:3000** with sign-in bypassed. Don't start another or run `next build`.
  Check your routes with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<route>` and look for errors in
  `/private/tmp/claude-501/-Users-deeparsh-Documents-MyProjects-TechNerv-Accounts-Manager/a01d7883-8af1-4b9a-8ef8-27abfad97cab/scratchpad/dev.log` (tail it).
  Don't use the browser tools — visual QA happens separately.
- Typecheck: `cd web && npx tsc --noEmit` (errors in other people's areas aren't yours; fix yours). Lint: `npx eslint <your paths>`.
- Don't `git commit`.
