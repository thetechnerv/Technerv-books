-- 0080 — Password sign-in managed by the owners (no email delivery needed).
-- Passwords themselves live in Supabase Auth (auth.users.encrypted_password,
-- bcrypt). These columns only track the one-time "temporary password" flow.
alter table accounts.members
  add column must_change_password    boolean not null default false,
  add column temp_password_expires_at timestamptz,
  add column temp_password_issued_by  uuid references accounts.members(id) on delete set null,
  add column password_changed_at      timestamptz,
  add column last_sign_in_at          timestamptz;

comment on column accounts.members.must_change_password is
  'True after an owner issues a temporary password; the member must choose their own before using the app.';
