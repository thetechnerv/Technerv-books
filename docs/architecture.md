# Architecture

[← Docs index](README.md)

## Overview

```
Browser (phone / desktop)
   │  React Server Components + client islands (Next.js 16 App Router)
   ▼
Next.js server (web/)
   ├─ src/proxy.ts           refresh Supabase session, redirect signed-out users to /login
   ├─ app/(app)/**/page.tsx  server components query Postgres via supabase-js
   ├─ app/(app)/**/actions.ts server actions = every mutation
   └─ app/api/**             PDFs, CSV/zip exports, file streaming, search
   │
   ▼
Supabase (TechNerv-Internal, ca-central-1)
   ├─ Postgres schema `accounts`   all app data, RLS = members only
   ├─ Storage bucket `accounts`    receipts, documents, logo, archived PDFs, import files
   └─ Auth                         email one-time codes, sign-ups disabled
```

The project is shared with other internal tools, so **everything lives in the `accounts` schema**
(exposed to PostgREST alongside `public`). Migration bookkeeping lives in `_harness`.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js **16.3** App Router, React 19, Turbopack | Middleware is `src/proxy.ts`; `params`/`searchParams` are Promises |
| Styling | Tailwind CSS v4 | Tokens in `src/app/globals.css` (`@theme inline`), no tailwind.config |
| Motion | `motion` (Framer Motion) | Springs for sheets, tab pill, swipe cards |
| Data | `@supabase/supabase-js` + `@supabase/ssr` | Typed with generated `database.types.ts` |
| PDFs | `@react-pdf/renderer` | Server-rendered; Inter from `@fontsource/inter` |
| PDF viewing | `pdfjs-dist` | Canvas renderer in the invoice detail page |
| CSV | `papaparse` | Bank imports |
| Zip | `jszip` | Year-end package, export-everything |
| Icons | `lucide-react` | |
| Dates | `date-fns` | |
| Class merge | `tailwind-merge` (via `lib/cn.ts`) | Later classes override earlier conflicting ones |

## Request flow

1. **Proxy** (`src/proxy.ts`) refreshes the auth cookie; signed-out → `/login?next=…`.
   In development with `DEV_AUTH_BYPASS_EMAIL`, it does nothing.
2. **Layout** `app/(app)/layout.tsx` loads the member, company name and badge counts
   (unreviewed bank rows, overdue invoices) and renders `AppShell` + `SearchPalette`.
3. **Pages** are async server components. They call `db()` (request-scoped client bound to
   `accounts`) and helpers in `lib/finance.ts`, then render shared UI components.
4. **Mutations** are server actions in route-local `actions.ts`:
   `'use server'` → `await currentMember()` → validate → write → `revalidatePath(...)` →
   return `ActionResult` (`{ ok: true, data? } | { ok: false, error }`). Client components show
   a toast (often with **Undo**) based on the result.
5. **Heavy outputs** (PDFs, zips, CSVs) are route handlers under `app/api/`, also guarded by
   `currentMember()`.

## Key shared modules (`web/src/lib`)

| File | What it does |
|---|---|
| `db.ts` | `db()` request client (cookie session, or secret-key client in dev bypass), `adminDb()`, `must()` |
| `session.ts` | `currentMember()`, `businessProfile()`, `allMembers()` — cached per request |
| `types.ts` | `Row<'table'>`, `View<'view'>`, `Enum<…>`, `ActionResult` |
| `finance.ts` | `cashPositions`, `receivables`, `gstSummary`, `gstForFiscalYear`, `monthlySeries`, `latestRate` |
| `fiscal.ts` | `fiscalYearOf`, `fiscalRange`, `fiscalLabel` (year named by the calendar year it ends in) |
| `format.ts` | `money`, `date`, `relativeDay`, `daysUntil`, `plural`, `initials`, `bytes`, … |
| `storage.ts` | signed uploads, attachment registry, signed URLs, server-side file writes |
| `compress.ts` | client-side WebP / gzip compression before upload |
| `hooks.ts` | `useMediaQuery`, `useIsDesktop`, `useDebounced`, `haptic` |
| `cn.ts` | class joiner with tailwind-merge (knows the custom type scale) |
| `database.types.ts` | generated — never edit by hand (`npm run db -- types`) |

## Folder conventions

- `app/(app)/<area>/` — pages, `loading.tsx`, `actions.ts`, private helpers in `_lib/`.
- `components/<area>/` — client components and server helpers for that area.
- `components/ui/` — design system (see [design-system.md](design-system.md)).
- `components/shell/` — sidebar, tab bar, quick-add, nav config, search palette.

## How it was built

The foundation (schema, harness, design system, shell, dashboard) was built first; then six areas
were built in parallel against the brief in [`web/DESIGN.md`](../web/DESIGN.md), each owning its own
folders and migration number range (00x0–00x9), followed by an integration and QA pass.
See [decisions.md](decisions.md).
