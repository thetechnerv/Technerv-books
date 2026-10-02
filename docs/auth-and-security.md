# Auth & security

[← Docs index](README.md) · Related: [Database → RLS](database.md#row-level-security)

## Sign-in: email + 4-digit PIN (no emails sent)

- `/login`: email (remembered on the device, `localStorage` key `tn-sign-in-email`), then an
  iOS-style PIN pad (`components/ui/pin-pad.tsx`). Server action `app/login/actions.ts`.
- **The PIN is never Supabase's password.** `lib/passwords.ts` derives the real Auth password as
  `"pin1." + base64url(HMAC-SHA256(AUTH_PIN_PEPPER, "email:pin"))`; Supabase stores that bcrypt-hashed.
  Without the server-only pepper a PIN guess can't be turned into a working password, so guesses must
  go through our action, which enforces the lockout.
- **Lockout** (`members.failed_pin_attempts`, `locked_until`): 5 misses → 15-minute lock (and every
  further 5); 10 → locked until an owner issues a new code. Success resets the counter.
- **Weak PINs rejected**: all-same digits, runs (1234/9876), repeated pairs (1212).
- **Onboarding / reset**: an owner opens Settings → Members → Sign-in access → *Set up* / *Reset PIN*.
  That creates (or resets) the Supabase user with a **6-digit one-time code** (72 h, single use),
  clears any lockout and sets `must_change_password`. The code is shown once (Copy / Share). The member
  signs in with "I have a one-time code" and is forced to `/set-password` to choose a PIN.
  `currentMember()` redirects anyone with `must_change_password` there.
- `/set-password` always re-asks for the code or current PIN, so a session left open on a lost device
  can't take over the account after a reset. Change PIN: Settings → Account.
- Remove access: owner → *Remove access…* (bans the Auth user, marks the member inactive).
- Bootstrap from a terminal: `cd harness && npm run db -- invite <email>` prints a one-time code.
- Sign-ups are disabled; only members can sign in. Email OTP/magic links are not used
  (Supabase's built-in sender is rate-limited).
- **`AUTH_PIN_PEPPER` must be identical everywhere that shares the database** (`web/.env.local`,
  Vercel production + preview). Changing or losing it invalidates every PIN — owners then re-issue codes.

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

- Add the production URL to Auth → URL configuration (site URL + redirect allow-list).
- **Rotate the personal access token** shared during setup — it can manage every project in the
  org, including the unrelated "TLO" project.
- Remove `DEV_AUTH_BYPASS_EMAIL` from any non-local environment (it's ignored in production anyway).
