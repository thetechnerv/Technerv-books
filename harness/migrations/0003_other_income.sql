-- 0003 — income that doesn't come from an invoice (bank interest, refunds,
-- grants, one-off sales) so the bank feed can be fully reconciled.
create table accounts.other_income (
  id            uuid primary key default gen_random_uuid(),
  received_on   date not null default current_date,
  source        text not null,
  description   text,
  category_id   uuid references accounts.categories(id),
  account_id    uuid references accounts.money_accounts(id),
  currency      text not null default 'CAD',
  amount        numeric(14,2) not null check (amount > 0),
  gst_hst       numeric(14,2) not null default 0,
  fx_rate       numeric(12,6) not null default 1,
  bank_transaction_id uuid references accounts.bank_transactions(id) on delete set null,
  notes         text,
  created_by    uuid references accounts.members(id),
  created_at    timestamptz not null default now()
);
alter table accounts.bank_transactions
  add column matched_income_id uuid references accounts.other_income(id) on delete set null;

alter table accounts.other_income enable row level security;
create policy members_all on accounts.other_income for all to authenticated using (accounts.is_member()) with check (accounts.is_member());
grant all on accounts.other_income to authenticated, service_role;
create trigger t_other_income_activity after insert or update or delete on accounts.other_income for each row execute function accounts.log_activity();
