# Search (⌘K) & navigation shell

[← Docs index](../README.md) · Related: [Design system](../design-system.md) · [PWA](pwa.md)

**Files** `web/src/components/shell/*` (`app-shell.tsx`, `nav.ts`, `logo.tsx`, `search-palette.tsx`, `search-field.tsx`), `web/src/app/(app)/layout.tsx`, `web/src/app/(app)/more/page.tsx`, `web/src/app/api/search/route.ts`

## Shell
- **Desktop (≥1024px)**: translucent sidebar with logo, **New** menu (quick-add), search button, nav groups from `nav.ts` (badges: overdue invoices, unreviewed bank rows), member footer.
- **Phones**: floating glass **tab bar** — Home · Invoices · **+** · Expenses · More — with a sliding pill; **+** opens the Quick-add sheet (Expense, Snap receipt, Invoice, Estimate, Payment received, Trip, Import statement, Owner transfer). `/more` lists every other section.
- Editors hide the tab bar (`/new`, `/edit`, `?edit=1`, `/banking/import`) via `data-tabbar="hidden"` → `--tabbar-h: -10px`.
- Keyboard (desktop): **N** quick-add, **E** new expense, **I** new invoice, **⌘K** search.

## Search palette
Opens on ⌘K / Ctrl+K, `/`, or the `open-search` window event (`SearchButton`, `SearchField`, `openSearch()`).
Desktop: Spotlight-style panel; phones: full-screen with the field focused. `GET /api/search?q=` (members only)
searches clients, invoices & estimates, expenses, payments and documents (amount-like queries match totals);
static **Actions** and **Pages** are included. Debounced, ↑↓ Enter Esc, recent searches in localStorage, highlighted matches.
