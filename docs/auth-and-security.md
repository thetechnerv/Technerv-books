# Auth & security

[← Docs index](README.md) · Related: [Database → RLS](database.md#row-level-security)

## Sign-in

- **Email one-time code** (Supabase Auth OTP). `/login` asks for the email, then the 6-digit code;
  magic links land on `/auth/callback`.
- **Sign-ups are disabled** (`npm run db -- auth-setup`). Only pre-created users can sign in, and
  `signInWithOtp` is called with `shouldCreateUser: false`.
- **Membership** = an active row in `accounts.members` whose `email` matches the signed-in user
  (or whose `user_id` = `auth.uid()`). `currentMember()` redirects non-members to
  `/login?error=not-a-member`.
- Members today: Deeparsh Singh (`deeparshsingh10@gmail.com`), Gursahib Singh (`gursahib99888@gmail.com`).
  Adding someone: add them in Settings → Members, then run `npm run db -- auth-setup`.

## Development bypass

When `NODE_ENV=development` **and** `DEV_AUTH_BYPASS_EMAIL` is set in `web/.env.local`:
- `proxy.ts` skips the session check,
- `db()` returns the **secret-key client** (RLS bypassed) and `currentMember()` resolves that email.

Production builds never take this path. The bypass also only applies to requests addressed to
**localhost** (`devBypass()` checks the `Host` header; the proxy does the same), because `next dev`
listens on the whole network. Set `DEV_BYPASS_ALLOW_LAN=1` to use it from a phone on trusted Wi-Fi.
The sidebar shows "Dev session (no sign-in)" so it's obvious.

## Authorization layers

1. **Proxy** redirects signed-out requests (optimistic, not a security boundary).
2. **Server actions / route handlers** call `await currentMember()` first.
3. **Postgres RLS** on every table: `accounts.is_member()` for role `authenticated`; `anon` has no
   table access. This is the real boundary.
4. **Storage** bucket `accounts` is private with the same member policy; files are served through
   `/api/files` (members only) or short-lived signed URLs.

## Hardening notes

- `/api/files` sends `X-Content-Type-Options: nosniff`; SVGs get a sandboxing CSP so an uploaded SVG
  can't run script.
- `SECURITY DEFINER` functions pin `search_path = accounts`; execute is revoked from `public`/`anon`
  except `public_invoice(token)` (read-only, not yet used by the UI).
- The secret key is only read server-side (`server-only` imports).
- `harness/.env` and `web/.env.local` are git-ignored and `chmod 600`.

## Before going live

- **Custom SMTP** (Supabase → Auth → SMTP, e.g. Resend): the built-in sender is rate-limited and may
  only deliver to Supabase org members, so codes might not reach the owners' Gmail.
- Add the production URL to Auth → URL configuration (site URL + redirect allow-list).
- **Rotate the personal access token** shared during setup — it can manage every project in the
  org, including the unrelated "TLO" project.
- Remove `DEV_AUTH_BYPASS_EMAIL` from any non-local environment (it's ignored in production anyway).
