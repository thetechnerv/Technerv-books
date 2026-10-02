-- Tech Nerv Accounts — foundation schema (draft v1)
-- Everything lives in the "accounts" schema so other internal tools can share
-- the TechNerv-Internal project without colliding.

create schema if not exists accounts;
create extension if not exists pgcrypto;

-- ───────────────────────── Enums ─────────────────────────
create type accounts.money_account_kind as enum ('bank', 'credit_card', 'cash', 'personal', 'payment_processor');
create type accounts.invoice_kind      as enum ('invoice', 'estimate', 'credit_note');
create type accounts.invoice_status    as enum ('draft', 'sent', 'partial', 'paid', 'void', 'accepted', 'declined');
create type accounts.payment_method    as enum ('etransfer', 'eft', 'wire', 'cheque', 'card', 'cash', 'stripe', 'other');
-- Who the money was really for, independent of which card paid it.
create type accounts.expense_nature    as enum ('business', 'personal', 'mixed');
create type accounts.bank_txn_status   as enum ('unreviewed', 'matched', 'created', 'ignored');

-- ───────────────────────── Company & people ─────────────────────────
create table accounts.business_profile (
  id                 boolean primary key default true check (id), -- single row
  legal_name         text not null,
  operating_name     text,
  business_number    text,          -- 9-digit BN
  gst_number         text,          -- BN + RT0001
  address_line1      text,
  address_line2      text,
  city               text,
  province           text not null default 'BC',
  postal_code        text,
  country            text not null default 'CA',
  email              text,
  phone              text,
  website            text,
  fiscal_year_end    text not null default '12-31',  -- MM-DD
  gst_filing_period  text not null default 'annual' check (gst_filing_period in ('monthly', 'quarterly', 'annual')),
  base_currency      text not null default 'CAD',
  invoice_prefix     text not null default 'TN-',
  next_invoice_seq   int  not null default 1001,
  estimate_prefix    text not null default 'EST-',
  next_estimate_seq  int  not null default 1001,
  default_terms_days int  not null default 15,
  payment_instructions text,
  invoice_footer     text,
  logo_path          text,
  updated_at         timestamptz not null default now()
);

create table accounts.members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  full_name     text not null,
  email         text not null unique,
  role          text not null default 'owner',
  ownership_pct numeric(5,2),
  color         text,                       -- avatar tint
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Where money lives or moves through. Each member gets a "personal" account so
-- out-of-pocket spending is tracked the same way as card spending.
create table accounts.money_accounts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           accounts.money_account_kind not null,
  institution    text,
  currency       text not null default 'CAD',
  last4          text,
  owner_member_id uuid references accounts.members(id),  -- card holder / personal owner
  opening_balance numeric(14,2) not null default 0,
  is_business    boolean not null default true,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ───────────────────────── Tax ─────────────────────────
create table accounts.tax_rates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,   -- GST, HST-ON, ZERO, EXEMPT …
  name        text not null,
  rate        numeric(6,4) not null,  -- 0.0500
  kind        text not null default 'gst' check (kind in ('gst', 'hst', 'pst', 'zero', 'exempt')),
  province    text,
  is_recoverable boolean not null default true, -- counts toward ITCs when paid on expenses
  active      boolean not null default true
);

-- Categories map to CRA GIFI codes so year-end is a straight export.
create table accounts.categories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            text not null check (kind in ('income', 'expense')),
  gifi_code       text,
  deductible_pct  numeric(5,2) not null default 100,  -- meals & entertainment = 50
  is_capital      boolean not null default false,     -- goes to CCA, not expensed
  cca_class       text,
  icon            text,
  color           text,
  sort            int not null default 0,
  archived        boolean not null default false,
  unique (kind, name)
);

-- ───────────────────────── Clients & work ─────────────────────────
create table accounts.clients (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null,
  company_name   text,
  contact_name   text,
  email          text,
  cc_emails      text[] not null default '{}',
  phone          text,
  address_line1  text,
  address_line2  text,
  city           text,
  province       text,
  postal_code    text,
  country        text not null default 'CA',
  currency       text not null default 'CAD',
  default_tax_rate_id uuid references accounts.tax_rates(id),
  terms_days     int,
  notes          text,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

create table accounts.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references accounts.clients(id) on delete set null,
  name        text not null,
  status      text not null default 'active' check (status in ('lead', 'active', 'paused', 'done')),
  budget      numeric(14,2),
  started_on  date,
  ended_on    date,
  notes       text,
  created_at  timestamptz not null default now()
);

create table accounts.items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  unit         text default 'each',
  unit_price   numeric(14,2) not null default 0,
  tax_rate_id  uuid references accounts.tax_rates(id),
  category_id  uuid references accounts.categories(id),
  archived     boolean not null default false
);

-- ───────────────────────── Invoices ─────────────────────────
create table accounts.invoices (
  id            uuid primary key default gen_random_uuid(),
  kind          accounts.invoice_kind not null default 'invoice',
  number        text not null,
  client_id     uuid not null references accounts.clients(id),
  project_id    uuid references accounts.projects(id),
  status        accounts.invoice_status not null default 'draft',
  issue_date    date not null default current_date,
  due_date      date,
  currency      text not null default 'CAD',
  fx_rate       numeric(12,6) not null default 1,  -- to CAD on issue date
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  tax_total     numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0,
  balance       numeric(14,2) generated always as (total - amount_paid) stored,
  po_number     text,
  notes         text,
  terms         text,
  share_token   text not null unique default encode(gen_random_bytes(18), 'hex'),
  sent_at       timestamptz,
  viewed_at     timestamptz,
  converted_from uuid references accounts.invoices(id),  -- estimate → invoice
  recurring_id  uuid,
  created_by    uuid references accounts.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind, number)
);

create table accounts.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references accounts.invoices(id) on delete cascade,
  sort         int not null default 0,
  item_id      uuid references accounts.items(id),
  description  text not null,
  quantity     numeric(12,3) not null default 1,
  unit_price   numeric(14,2) not null default 0,
  tax_rate_id  uuid references accounts.tax_rates(id),
  amount       numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);

create table accounts.recurring_invoices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references accounts.clients(id),
  project_id    uuid references accounts.projects(id),
  template_invoice_id uuid references accounts.invoices(id),
  frequency     text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_on   date not null,
  end_on        date,
  auto_send     boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Payments received ─────────────────────────
create table accounts.payments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references accounts.clients(id),
  received_on     date not null default current_date,
  amount          numeric(14,2) not null check (amount > 0),
  currency        text not null default 'CAD',
  fx_rate         numeric(12,6) not null default 1,
  method          accounts.payment_method not null default 'etransfer',
  deposit_account_id uuid references accounts.money_accounts(id),
  reference       text,
  notes           text,
  recorded_by     uuid references accounts.members(id),
  created_at      timestamptz not null default now()
);

-- One payment can settle several invoices (and vice versa).
create table accounts.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references accounts.payments(id) on delete cascade,
  invoice_id  uuid not null references accounts.invoices(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  unique (payment_id, invoice_id)
);

-- ───────────────────────── Expenses ─────────────────────────
create table accounts.expenses (
  id              uuid primary key default gen_random_uuid(),
  spent_on        date not null default current_date,
  vendor          text not null,
  description     text,
  category_id     uuid references accounts.categories(id),
  project_id      uuid references accounts.projects(id),
  -- who and how
  spent_by        uuid not null references accounts.members(id),
  paid_from_account_id uuid not null references accounts.money_accounts(id),
  -- what it was for
  nature          accounts.expense_nature not null default 'business',
  business_pct    numeric(5,2) not null default 100 check (business_pct between 0 and 100),
  -- amounts in original currency
  currency        text not null default 'CAD',
  subtotal        numeric(14,2) not null default 0,
  gst_hst         numeric(14,2) not null default 0,  -- recoverable via ITC
  pst             numeric(14,2) not null default 0,  -- not recoverable
  total           numeric(14,2) not null check (total >= 0),
  fx_rate         numeric(12,6) not null default 1,   -- Bank of Canada rate on spent_on
  total_cad       numeric(14,2) generated always as (round(total * fx_rate, 2)) stored,
  billable        boolean not null default false,
  billed_invoice_id uuid references accounts.invoices(id),
  -- settlement between the company and a member (see shareholder_ledger)
  settled         boolean not null default false,
  settled_on      date,
  tags            text[] not null default '{}',
  notes           text,
  source          text not null default 'manual' check (source in ('manual', 'bank_import', 'receipt_scan', 'recurring')),
  bank_transaction_id uuid,
  created_by      uuid references accounts.members(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint mixed_needs_pct check (nature <> 'mixed' or business_pct between 1 and 99)
);

-- Money moved between the company and a member that is not an expense:
-- reimbursements, repayments, capital contributions, dividends.
create table accounts.member_transfers (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references accounts.members(id),
  occurred_on   date not null default current_date,
  kind          text not null check (kind in ('reimbursement', 'repayment', 'contribution', 'dividend', 'salary', 'other')),
  amount        numeric(14,2) not null check (amount > 0),
  account_id    uuid references accounts.money_accounts(id),
  notes         text,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Bank feed ─────────────────────────
create table accounts.bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts.money_accounts(id),
  posted_on     date not null,
  description   text not null,
  amount        numeric(14,2) not null,   -- + money in, − money out
  balance_after numeric(14,2),
  source        text not null default 'csv' check (source in ('csv', 'plaid', 'manual')),
  external_id   text,
  dedupe_hash   text not null,
  status        accounts.bank_txn_status not null default 'unreviewed',
  matched_expense_id uuid references accounts.expenses(id) on delete set null,
  matched_payment_id uuid references accounts.payments(id) on delete set null,
  matched_transfer_id uuid references accounts.member_transfers(id) on delete set null,
  import_batch  uuid,
  created_at    timestamptz not null default now(),
  unique (account_id, dedupe_hash)
);
alter table accounts.expenses
  add constraint expenses_bank_txn_fk foreign key (bank_transaction_id)
  references accounts.bank_transactions(id) on delete set null;

-- "Anything from OPENAI → Software, business, Business Mastercard"
create table accounts.rules (
  id            uuid primary key default gen_random_uuid(),
  match_text    text not null,             -- case-insensitive contains
  category_id   uuid references accounts.categories(id),
  nature        accounts.expense_nature,
  vendor_rename text,
  project_id    uuid references accounts.projects(id),
  priority      int not null default 0,
  times_applied int not null default 0,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Records ─────────────────────────
create table accounts.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('expense', 'invoice', 'payment', 'document', 'bank_transaction')),
  entity_id    uuid not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references accounts.members(id),
  created_at   timestamptz not null default now()
);
create index on accounts.attachments (entity_type, entity_id);

-- The tax-time vault: incorporation docs, GST registration, filed returns, NOAs, contracts.
create table accounts.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  doc_type     text not null,  -- corporate, gst_return, t2_return, notice_of_assessment, contract, statement, other
  fiscal_year  int,
  issued_on    date,
  expires_on   date,
  notes        text,
  created_at   timestamptz not null default now()
);

create table accounts.mileage_trips (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references accounts.members(id),
  trip_on     date not null default current_date,
  origin      text,
  destination text,
  purpose     text not null,
  km          numeric(8,1) not null check (km > 0),
  rate_per_km numeric(6,3) not null,
  project_id  uuid references accounts.projects(id),
  reimbursed  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table accounts.tax_filings (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('gst', 't2', 't4', 't5', 'other')),
  period_start  date not null,
  period_end    date not null,
  due_on        date,
  filed_on      date,
  confirmation  text,
  amount_owing  numeric(14,2),
  paid_on       date,
  notes         text,
  unique (kind, period_start, period_end)
);

create table accounts.fx_rates (
  currency   text not null,
  rate_date  date not null,
  rate_to_cad numeric(12,6) not null,
  source     text not null default 'bank_of_canada',
  primary key (currency, rate_date)
);

create table accounts.activity_log (
  id          bigint generated always as identity primary key,
  member_id   uuid references accounts.members(id),
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  summary     text,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Logic ─────────────────────────
create or replace function accounts.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger t_invoices_touch before update on accounts.invoices for each row execute function accounts.touch_updated_at();
create trigger t_expenses_touch before update on accounts.expenses for each row execute function accounts.touch_updated_at();

-- Atomically hand out the next invoice / estimate number.
create or replace function accounts.next_document_number(p_kind accounts.invoice_kind)
returns text language plpgsql set search_path = accounts as $$
declare v text;
begin
  if p_kind = 'estimate' then
    update business_profile set next_estimate_seq = next_estimate_seq + 1
      returning estimate_prefix || (next_estimate_seq - 1) into v;
  else
    update business_profile set next_invoice_seq = next_invoice_seq + 1
      returning invoice_prefix || (next_invoice_seq - 1) into v;
  end if;
  return v;
end $$;

-- Recompute invoice totals whenever its lines change.
create or replace function accounts.recalc_invoice(p_invoice uuid) returns void
language plpgsql set search_path = accounts as $$
declare v_sub numeric(14,2); v_tax numeric(14,2);
begin
  select coalesce(sum(l.amount), 0),
         coalesce(sum(round(l.amount * coalesce(t.rate, 0), 2)), 0)
    into v_sub, v_tax
    from invoice_lines l left join tax_rates t on t.id = l.tax_rate_id
   where l.invoice_id = p_invoice;
  update invoices set subtotal = v_sub, tax_total = v_tax, total = v_sub - discount + v_tax
   where id = p_invoice;
end $$;

create or replace function accounts.on_line_change() returns trigger language plpgsql as $$
begin
  perform accounts.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger t_lines_recalc after insert or update or delete on accounts.invoice_lines
  for each row execute function accounts.on_line_change();

-- Keep amount_paid / status in sync with payment allocations.
create or replace function accounts.recalc_invoice_paid(p_invoice uuid) returns void
language plpgsql set search_path = accounts as $$
declare v_paid numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_paid from payment_allocations where invoice_id = p_invoice;
  update invoices set
    amount_paid = v_paid,
    status = case
      when status in ('void', 'draft') and v_paid = 0 then status
      when v_paid >= total and total > 0 then 'paid'
      when v_paid > 0 then 'partial'
      when status in ('paid', 'partial') then 'sent'
      else status end
  where id = p_invoice;
end $$;

create or replace function accounts.on_allocation_change() returns trigger language plpgsql as $$
begin
  perform accounts.recalc_invoice_paid(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    perform accounts.recalc_invoice_paid(old.invoice_id);
  end if;
  return null;
end $$;
create trigger t_alloc_recalc after insert or update or delete on accounts.payment_allocations
  for each row execute function accounts.on_allocation_change();

-- ───────────────────────── Views ─────────────────────────
-- Invoices with a computed "overdue" flag and days outstanding.
create or replace view accounts.invoice_overview with (security_invoker = true) as
select i.*,
       c.display_name as client_name,
       (i.kind = 'invoice' and i.status in ('sent', 'partial') and i.due_date < current_date) as is_overdue,
       greatest(current_date - i.due_date, 0) as days_overdue
from accounts.invoices i join accounts.clients c on c.id = i.client_id;

-- Expenses with the deductible portion and ITC already worked out.
create or replace view accounts.expense_overview with (security_invoker = true) as
select e.*,
       m.full_name  as spent_by_name,
       a.name       as paid_from_name,
       a.kind       as paid_from_kind,
       a.is_business as paid_with_business_funds,
       cat.name     as category_name,
       cat.gifi_code,
       case e.nature when 'personal' then 0 else e.business_pct end as effective_business_pct,
       round(e.total_cad * (case e.nature when 'personal' then 0 else e.business_pct end) / 100
             * coalesce(cat.deductible_pct, 100) / 100, 2) as deductible_cad,
       round(e.gst_hst * e.fx_rate * (case e.nature when 'personal' then 0 else e.business_pct end) / 100
             * coalesce(cat.deductible_pct, 100) / 100, 2) as itc_cad
from accounts.expenses e
join accounts.members m on m.id = e.spent_by
join accounts.money_accounts a on a.id = e.paid_from_account_id
left join accounts.categories cat on cat.id = e.category_id;

-- Who owes whom. Positive = the company owes the member.
--  · business portion paid with personal money → company owes member
--  · personal portion paid with business money → member owes company (shareholder loan)
create or replace view accounts.member_balances with (security_invoker = true) as
with moves as (
  select e.spent_by as member_id,
         case when not a.is_business
              then round(e.total_cad * (case e.nature when 'personal' then 0 else e.business_pct end) / 100, 2)
              else -round(e.total_cad * (100 - case e.nature when 'personal' then 0 else e.business_pct end) / 100, 2)
         end as amount
  from accounts.expenses e join accounts.money_accounts a on a.id = e.paid_from_account_id
  union all
  select t.member_id,
         case t.kind when 'reimbursement' then -t.amount   -- company paid member back
                     when 'repayment'     then  t.amount   -- member paid company back
                     when 'contribution'  then  t.amount
                     else 0 end
  from accounts.member_transfers t
  union all
  select m.member_id, round(m.km * m.rate_per_km, 2) from accounts.mileage_trips m
)
select mem.id as member_id, mem.full_name, coalesce(sum(moves.amount), 0) as balance
from accounts.members mem left join moves on moves.member_id = mem.id
group by mem.id, mem.full_name;

-- ───────────────────────── Security ─────────────────────────
create or replace function accounts.is_member() returns boolean
language sql stable security definer set search_path = accounts as $$
  select exists (select 1 from members where user_id = auth.uid() and active);
$$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'accounts' loop
    execute format('alter table accounts.%I enable row level security', t);
    execute format('create policy members_all on accounts.%I for all to authenticated using (accounts.is_member()) with check (accounts.is_member())', t);
  end loop;
end $$;

-- Public, read-only invoice view for the client link (no login).
create or replace function accounts.public_invoice(p_token text) returns jsonb
language sql stable security definer set search_path = accounts as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) - 'share_token' - 'created_by',
    'client',  to_jsonb(c) - 'notes',
    'lines',   coalesce((select jsonb_agg(to_jsonb(l) order by l.sort) from invoice_lines l where l.invoice_id = i.id), '[]'),
    'business', to_jsonb(b) - 'next_invoice_seq' - 'next_estimate_seq')
  from invoices i join clients c on c.id = i.client_id cross join business_profile b
  where i.share_token = p_token and i.status <> 'draft';
$$;

grant usage on schema accounts to authenticated, service_role, anon;
grant all on all tables in schema accounts to authenticated, service_role;
grant all on all sequences in schema accounts to authenticated, service_role;
revoke execute on all functions in schema accounts from public, anon;
grant execute on all functions in schema accounts to authenticated, service_role;
grant execute on function accounts.public_invoice(text) to anon, authenticated;
