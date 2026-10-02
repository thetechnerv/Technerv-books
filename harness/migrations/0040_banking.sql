-- 0040 — Banking: review metadata, import files, rule suggestions,
-- normalised duplicate detection, undo import and month-end reconciliation.

-- ───────────── Review metadata on the feed ─────────────
alter table accounts.bank_transactions
  add column note         text,                                   -- e.g. "Transfer to Business Card"
  add column rule_id      uuid references accounts.rules(id) on delete set null,  -- suggestion from a rule
  add column auto_matched boolean not null default false,         -- matched by the importer, not a person
  add column reviewed_by  uuid references accounts.members(id) on delete set null,
  add column reviewed_at  timestamptz;

create index if not exists bank_txn_account_date on accounts.bank_transactions (account_id, posted_on);
create index if not exists bank_txn_status on accounts.bank_transactions (status) where status = 'unreviewed';

-- Where the original (gzipped) CSV of an import is kept.
alter table accounts.import_batches
  add column file_path   text,
  add column file_format text,           -- csv | ofx
  add column rows_matched int not null default 0;

-- ───────────── Duplicate detection ─────────────
-- Description normalised the same way the importer does it in TypeScript:
-- upper case, anything that isn't a letter or digit becomes a space, spaces collapsed.
create or replace function accounts.normalise_bank_description(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- sha256 of account|date|amount|normalised description (hex). Mirrors dedupeKey() in the web app.
create or replace function accounts.bank_dedupe_hash(p_account uuid, p_on date, p_amount numeric, p_description text)
returns text language sql immutable as $$
  select encode(extensions.digest(
    p_account::text || '|' || to_char(p_on, 'YYYY-MM-DD') || '|' || to_char(round(p_amount, 2), 'FM999999999990.00') || '|' || accounts.normalise_bank_description(p_description),
    'sha256'), 'hex');
$$;

-- ───────────── Rules → suggestions ─────────────
-- Best rule for a description: case-insensitive "contains", highest priority, then the most specific (longest) text.
create or replace function accounts.best_rule(p_description text) returns uuid
language sql stable set search_path = accounts as $$
  select r.id from rules r
  where position(upper(r.match_text) in upper(p_description)) > 0
  order by r.priority desc, length(r.match_text) desc, r.created_at
  limit 1;
$$;

-- Re-point every unreviewed transaction (optionally one account) at its best rule. Returns how many have a suggestion.
create or replace function accounts.apply_rules_to_unreviewed(p_account uuid default null) returns int
language plpgsql set search_path = accounts as $$
declare v int;
begin
  update bank_transactions t set rule_id = accounts.best_rule(t.description)
  where t.status = 'unreviewed' and (p_account is null or t.account_id = p_account);
  select count(*) into v from bank_transactions
  where status = 'unreviewed' and rule_id is not null and (p_account is null or account_id = p_account);
  return v;
end $$;

-- ───────────── Undo import ─────────────
-- Deletes the batch's rows nobody has matched or recorded yet. Rows already linked to a record
-- stay (they're part of the books); the batch is removed only when nothing is left in it.
create or replace function accounts.undo_import(p_batch uuid) returns jsonb
language plpgsql set search_path = accounts as $$
declare v_deleted int; v_kept int; v_path text;
begin
  select file_path into v_path from import_batches where id = p_batch;
  if not found then raise exception 'Import not found'; end if;

  with gone as (
    delete from bank_transactions
    where import_batch = p_batch and status in ('unreviewed', 'ignored')
      and matched_expense_id is null and matched_payment_id is null and matched_transfer_id is null and matched_income_id is null
    returning id
  ) select count(*) into v_deleted from gone;

  select count(*) into v_kept from bank_transactions where import_batch = p_batch;
  if v_kept = 0 then
    delete from import_batches where id = p_batch;
  else
    update import_batches set rows_imported = v_kept where id = p_batch;
  end if;
  return jsonb_build_object('deleted', v_deleted, 'kept', v_kept, 'batch_deleted', v_kept = 0, 'file_path', v_path);
end $$;

-- ───────────── Balances & reconciliation ─────────────
-- The app's own balance for an account at the end of a day: opening balance + every imported amount up to it.
create or replace function accounts.account_balance_at(p_account uuid, p_on date) returns numeric
language sql stable set search_path = accounts as $$
  select coalesce((select opening_balance from money_accounts where id = p_account), 0)
       + coalesce((select sum(amount) from bank_transactions where account_id = p_account and posted_on <= p_on), 0);
$$;

create table accounts.reconciliations (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts.money_accounts(id) on delete cascade,
  period_end        date not null,
  statement_balance numeric(14,2) not null,
  computed_balance  numeric(14,2) not null,
  notes             text,
  reconciled_by     uuid references accounts.members(id) on delete set null,
  reconciled_at     timestamptz not null default now(),
  unique (account_id, period_end)
);

alter table accounts.reconciliations enable row level security;
create policy members_all on accounts.reconciliations for all to authenticated using (accounts.is_member()) with check (accounts.is_member());
grant all on accounts.reconciliations to authenticated, service_role;

revoke execute on all functions in schema accounts from public, anon;
grant execute on all functions in schema accounts to authenticated, service_role;
grant execute on function accounts.public_invoice(text) to anon;
