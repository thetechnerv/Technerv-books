# Settings

[← Docs index](../README.md) · Related: [Design system](../design-system.md)

**Routes** `/settings` + `company`, `branding`, `tax`, `members`, `accounts`, `categories`, `products`, `mileage`, `owners`, `appearance`, `data`, `activity`, `account`; `GET /api/settings/export`, `GET /api/settings/logo`
**Files** `web/src/app/(app)/settings/**`, `web/src/components/settings/*` (`settings-form.tsx` = shared save pattern, `validate.ts`, `category-icons.tsx`, …) · migration 0060

**Save pattern**: explicit Save (toolbar on desktop; sticky "Unsaved changes · Discard · Save" bar on
phones), ⌘S, blur validation, leave-page warning. Lists edit in sheets; archive/deactivate has undo.
Logo upload and Appearance apply immediately.

| Section | Contents |
|---|---|
| Company | Legal/operating name, BN (9 digits), GST/HST (`123456789 RT0001`, must start with the BN), BC incorporation no., dates, address, contact, timezone |
| Branding & invoices | Logo (PNG/JPEG, compressed, `branding/logo-*`), theme (studio/midnight/minimal) with **live PDF preview**, accent swatches + custom, show-logo, thank-you, footer, payment instructions, e-Transfer, bank details, numbering (blocks numbers already used), terms, estimate validity |
| Tax | Filing period, fiscal year-end (warning), GST registration date, quick method, default tax code, **tax rates** (rates in use can't change %), receipt threshold, **Close the books** (`lock_books_before`) / reopen |
| Members | Name, email, initials, colour, ownership % (warns if ≠ 100), active; new member also gets a personal money account; shows `auth-setup` command |
| Accounts | Money accounts (currency locked once imported into) |
| Categories | Expense/income, GIFI with suggestions, deductible %, capital + CCA class, icon, colour, reorder, archive |
| Products & services | Invoice catalogue |
| Mileage | Per-km rates with one-tap "Use 2026 rates" (73¢ / 67¢) |
| Owners & loans | Shareholder-loan alert days |
| Appearance | System / Light / Dark (`theme` cookie → `data-theme`) |
| Data & storage | Storage used, compression savings, record counts, Export everything, sample-data notice |
| Activity | Full `activity_log` with filters |
| Account | Signed-in member, Sign out |
