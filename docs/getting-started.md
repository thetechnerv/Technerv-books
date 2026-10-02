# Getting started

[← Docs index](README.md)

## Prerequisites

- Node 18+ (developed on Node 24, npm 11)
- Access to the Supabase project **TechNerv-Internal** (ref `tuivualphpzoymnbtszc`, region `ca-central-1`)
- A Supabase **personal access token** (Dashboard → Account → Access tokens)

## 1. Harness environment

```bash
cd harness
cp .env.example .env
# edit .env → SUPABASE_ACCESS_TOKEN=sbp_…  SUPABASE_PROJECT_REF=tuivualphpzoymnbtszc
npm run db -- status        # shows applied / pending migrations
```

## 2. Web environment

```bash
npm run db -- web-env       # writes web/.env.local (URL, publishable key, secret key, dev bypass)
cd ../web && npm install
npm run dev                 # http://localhost:3000
```

`web/.env.local` contains:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe key (RLS applies) |
| `SUPABASE_SECRET_KEY` | Server-only; used by the dev bypass and server file writes |
| `DEV_AUTH_BYPASS_EMAIL` | **Dev only.** Skip sign-in and act as this member. Ignored by production builds. |

Remove `DEV_AUTH_BYPASS_EMAIL` to test the real sign-in flow locally.

## 3. Useful commands

```bash
# web/
npm run dev            # dev server (Turbopack)
npx tsc --noEmit       # typecheck
npx eslint src         # lint
npx next build         # production build (stop the dev server first; both use .next/)

# harness/
npm run migrate        # apply new migrations
npm test               # SQL tests
npm run db -- types    # regenerate web/src/lib/database.types.ts after schema changes
npm run db -- sql "select count(*) from accounts.expenses"
```

## 4. Checking your work

- Phone layout: open the browser at 375×812 (or the dev tools device toolbar).
- Every route should return 200: see the smoke-test loop in [harness.md](harness.md#smoke-testing-routes).
- Dark mode: Settings → Appearance, or the OS setting.

## 5. Going live (later)

See [roadmap.md → Go-live checklist](roadmap.md#go-live-checklist).
