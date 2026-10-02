-- 0002 — global settings, invoice revisions, CSV imports, subscriptions,
-- activity history, file storage and email-based membership.

-- ───────────── Settings on the company profile ─────────────
alter table accounts.business_profile
  add column gst_quick_method      boolean not null default false,
  add column gst_registered_on     date,
  add column incorporated_on       date,
  add column bc_incorporation_number text,
  add column timezone              text not null default 'America/Vancouver',
  add column default_tax_code      text not null default 'GST',
  add column estimate_valid_days   int  not null default 30,
  add column etransfer_email       text,
  add column bank_details          text,
  add column invoice_theme         text not null default 'studio' check (invoice_theme in ('studio', 'midnight', 'minimal')),
  add column invoice_accent        text not null default '#03DDAA',
  add column invoice_show_logo     boolean not null default true,
  add column invoice_thank_you     text default 'Thank you for building with Tech Nerv.',
  add column mileage_rate          numeric(6,3) not null default 0.72,
  add column mileage_rate_after_5000 numeric(6,3) not null default 0.66,
  add column receipt_required_over numeric(10,2) not null default 0,
  add column shareholder_loan_alert_days int not null default 300,
  add column lock_books_before     date;   -- prevents edits to closed periods

update accounts.business_profile set fiscal_year_end = '09-30';

alter table accounts.members add column preferences jsonb not null default '{}';
alter table accounts.members add column initials text;

-- Bank/card CSV column mapping lives on the account it imports into.
alter table accounts.money_accounts
  add column csv_mapping jsonb,
  add column color text,
  add column notes text;

alter table accounts.invoices
  add column title text,
  add column archived_pdf_path text,
  add column revision int not null default 1,
  add column last_reminded_at timestamptz;
alter table accounts.invoice_lines add column unit text;

alter table accounts.attachments
  add column original_size_bytes bigint,
  add column compression text;   -- 'webp', 'gzip', null = stored as-is

-- ───────────── Invoice revisions ─────────────
-- A full snapshot (invoice + lines + client + business) every time an issued
-- invoice is changed or regenerated, so any earlier PDF can be reproduced.
create table accounts.invoice_revisions (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references accounts.invoices(id) on delete cascade,
  revision    int  not null,
  reason      text,
  snapshot    jsonb not null,
  created_by  uuid references accounts.members(id),
  created_at  timestamptz not null default now(),
  unique (invoice_id, revision)
);

-- ───────────── CSV imports ─────────────
create table accounts.import_batches (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts.money_accounts(id) on delete cascade,
  file_name     text not null,
  rows_total    int not null default 0,
  rows_imported int not null default 0,
  rows_duplicate int not null default 0,
  date_from     date,
  date_to       date,
  imported_by   uuid references accounts.members(id),
  created_at    timestamptz not null default now()
);
alter table accounts.bank_transactions
  add constraint bank_txn_batch_fk foreign key (import_batch) references accounts.import_batches(id) on delete cascade;

-- ───────────── Subscriptions / recurring expenses ─────────────
create table accounts.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  vendor        text not null,
  description   text,
  category_id   uuid references accounts.categories(id),
  spent_by      uuid not null references accounts.members(id),
  paid_from_account_id uuid not null references accounts.money_accounts(id),
  nature        accounts.expense_nature not null default 'business',
  business_pct  numeric(5,2) not null default 100,
  currency      text not null default 'CAD',
  amount        numeric(14,2) not null,
  gst_hst       numeric(14,2) not null default 0,
  frequency     text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_on       date not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table accounts.expenses add column recurring_expense_id uuid references accounts.recurring_expenses(id) on delete set null;

-- ───────────── Membership by email ─────────────
-- A signed-in user is a member when their auth email matches an active member.
create or replace function accounts.current_member_id() returns uuid
language sql stable security definer set search_path = accounts as $$
  select id from members
  where active and (user_id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'))
  limit 1;
$$;

create or replace function accounts.is_member() returns boolean
language sql stable security definer set search_path = accounts as $$
  select accounts.current_member_id() is not null;
$$;

-- ───────────── Activity history ─────────────
create or replace function accounts.log_activity() returns trigger
language plpgsql security definer set search_path = accounts as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_summary text;
begin
  v_summary := coalesce(r ->> 'number', r ->> 'vendor', r ->> 'display_name', r ->> 'title', r ->> 'name', r ->> 'description');
  insert into activity_log (member_id, entity_type, entity_id, action, summary)
  values (accounts.current_member_id(), tg_table_name, (r ->> 'id')::uuid, lower(tg_op), v_summary);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'payments', 'expenses', 'clients', 'member_transfers', 'mileage_trips', 'documents', 'import_batches', 'recurring_expenses', 'projects'] loop
    execute format('create trigger t_%s_activity after insert or update or delete on accounts.%I for each row execute function accounts.log_activity()', t, t);
  end loop;
end $$;

-- ───────────── Views (recreated to pick up new columns) ─────────────
drop view if exists accounts.expense_overview;
create view accounts.expense_overview with (security_invoker = true) as
select e.*,
       m.full_name   as spent_by_name,
       m.initials    as spent_by_initials,
       m.color       as spent_by_color,
       a.name        as paid_from_name,
       a.kind        as paid_from_kind,
       a.is_business as paid_with_business_funds,
       cat.name      as category_name,
       cat.icon      as category_icon,
       cat.gifi_code,
       cat.is_capital,
       p.name        as project_name,
       (select count(*) from accounts.attachments at where at.entity_type = 'expense' and at.entity_id = e.id)::int as attachment_count,
       case e.nature when 'personal' then 0 else e.business_pct end as effective_business_pct,
       round(e.total_cad * (case e.nature when 'personal' then 0 else e.business_pct end) / 100
             * coalesce(cat.deductible_pct, 100) / 100, 2) as deductible_cad,
       -- CRA limits ITCs on meals & entertainment the same 50% as the deduction
       round(e.gst_hst * e.fx_rate * (case e.nature when 'personal' then 0 else e.business_pct end) / 100
             * coalesce(cat.deductible_pct, 100) / 100, 2) as itc_cad
from accounts.expenses e
join accounts.members m on m.id = e.spent_by
join accounts.money_accounts a on a.id = e.paid_from_account_id
left join accounts.categories cat on cat.id = e.category_id
left join accounts.projects p on p.id = e.project_id;

drop view if exists accounts.invoice_overview;
create view accounts.invoice_overview with (security_invoker = true) as
select i.*,
       c.display_name as client_name,
       c.email        as client_email,
       p.name         as project_name,
       (i.kind = 'invoice' and i.status in ('sent', 'partial') and i.due_date < current_date) as is_overdue,
       greatest(current_date - i.due_date, 0) as days_overdue,
       round(i.total * i.fx_rate, 2) as total_cad,
       (select max(py.received_on) from accounts.payment_allocations pa join accounts.payments py on py.id = pa.payment_id where pa.invoice_id = i.id) as last_payment_on
from accounts.invoices i
join accounts.clients c on c.id = i.client_id
left join accounts.projects p on p.id = i.project_id;

-- ───────────── RLS for the new tables ─────────────
do $$
declare t text;
begin
  foreach t in array array['invoice_revisions', 'import_batches', 'recurring_expenses'] loop
    execute format('alter table accounts.%I enable row level security', t);
    execute format('create policy members_all on accounts.%I for all to authenticated using (accounts.is_member()) with check (accounts.is_member())', t);
  end loop;
end $$;

grant all on all tables in schema accounts to authenticated, service_role;
revoke execute on all functions in schema accounts from public, anon;
grant execute on all functions in schema accounts to authenticated, service_role;
grant execute on function accounts.public_invoice(text) to anon;

-- ───────────── File storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('accounts', 'accounts', false, 26214400)
on conflict (id) do nothing;

create policy "accounts members read"   on storage.objects for select to authenticated using (bucket_id = 'accounts' and accounts.is_member());
create policy "accounts members write"  on storage.objects for insert to authenticated with check (bucket_id = 'accounts' and accounts.is_member());
create policy "accounts members update" on storage.objects for update to authenticated using (bucket_id = 'accounts' and accounts.is_member());
create policy "accounts members delete" on storage.objects for delete to authenticated using (bucket_id = 'accounts' and accounts.is_member());
