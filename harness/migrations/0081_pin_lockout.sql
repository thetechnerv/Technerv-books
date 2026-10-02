-- 0081 — 4-digit PIN sign-in: brute-force lockout.
-- The PIN is never sent to Supabase as-is: the server derives the real Auth
-- password as HMAC-SHA256(AUTH_PIN_PEPPER, email:pin), so guesses can only
-- go through the app, which counts them here.
alter table accounts.members
  add column failed_pin_attempts int not null default 0,
  add column locked_until timestamptz;
