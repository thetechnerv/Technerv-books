-- 0030 — Expenses, owner balances, subscriptions and mileage.
--  · Settlements remember which transfer cleared which expenses / trips, so
--    deleting a transfer re-opens exactly what it covered.
--  · member_ledger: every movement behind member_balances, one row each, with
--    the CRA s.15(2) repay-by date on amounts an owner owes the company.
--  · Mileage rate helper for the CRA two-tier allowance (first 5,000 km per
--    calendar year at mileage_rate, the rest at mileage_rate_after_5000).

-- ───────────── Settlement links ─────────────
alter table accounts.expenses
  add column settlement_transfer_id uuid references accounts.member_transfers(id) on delete set null;

alter table accounts.mileage_trips
  add column round_trip boolean not null default false,
  add column reimbursed_on date,
  add column settlement_transfer_id uuid references accounts.member_transfers(id) on delete set null;

create index on accounts.expenses (settlement_transfer_id) where settlement_transfer_id is not null;
create index on accounts.mileage_trips (settlement_transfer_id) where settlement_transfer_id is not null;

create or replace function accounts.on_transfer_delete() returns trigger
language plpgsql set search_path = accounts as $$
begin
  update expenses set settled = false, settled_on = null where settlement_transfer_id = old.id;
  update mileage_trips set reimbursed = false, reimbursed_on = null where settlement_transfer_id = old.id;
  return old;
end $$;
create trigger t_transfer_reopen before delete on accounts.member_transfers
  for each row execute function accounts.on_transfer_delete();

-- ───────────── Subscriptions: keep the full tax split ─────────────
alter table accounts.recurring_expenses
  add column pst        numeric(14,2) not null default 0,
  add column project_id uuid references accounts.projects(id) on delete set null,
  add column notes      text;

-- Backfill PST from the most recent charge logged for each subscription.
update accounts.recurring_expenses r set pst = last.pst
from (
  select distinct on (recurring_expense_id) recurring_expense_id, pst
  from accounts.expenses where recurring_expense_id is not null
  order by recurring_expense_id, spent_on desc
) last
where last.recurring_expense_id = r.id and last.pst <> 0;

-- ───────────── Fiscal helpers ─────────────
-- Last day of the fiscal year that contains p_on (business_profile.fiscal_year_end = 'MM-DD').
create or replace function accounts.fiscal_year_end_on(p_on date) returns date
language sql stable set search_path = accounts as $$
  with fye as (
    select split_part(fiscal_year_end, '-', 1)::int as m, split_part(fiscal_year_end, '-', 2)::int as d
    from business_profile limit 1
  ), this_year as (
    select make_date(extract(year from p_on)::int, fye.m, fye.d) as e from fye
  )
  select case when p_on > e then (e + interval '1 year')::date else e end from this_year;
$$;

-- s.15(2): a shareholder loan must be repaid within one year after the end of
-- the corporation's tax year in which it arose, or it is included in income.
create or replace function accounts.shareholder_loan_repay_by(p_on date) returns date
language sql stable set search_path = accounts as $$
  select (fiscal_year_end_on(p_on) + interval '1 year')::date;
$$;

-- ───────────── Mileage ─────────────
-- Blended per-km rate for a new (or edited) trip given how far the member has
-- already driven this calendar year. p_exclude = the trip being edited.
create or replace function accounts.mileage_rate_for(p_member uuid, p_trip_on date, p_km numeric, p_exclude uuid default null)
returns numeric language plpgsql stable set search_path = accounts as $$
declare
  v_prior numeric; v_first numeric; v_rest numeric; r1 numeric; r2 numeric;
begin
  if p_km is null or p_km <= 0 then return null; end if;
  select mileage_rate, mileage_rate_after_5000 into r1, r2 from business_profile limit 1;
  select coalesce(sum(km), 0) into v_prior from mileage_trips
   where member_id = p_member
     and extract(year from trip_on) = extract(year from p_trip_on)
     and trip_on <= p_trip_on
     and (p_exclude is null or id <> p_exclude);
  v_first := greatest(0, least(p_km, 5000 - v_prior));
  v_rest := p_km - v_first;
  return round((v_first * r1 + v_rest * r2) / p_km, 3);
end $$;

-- ───────────── Owner ledger ─────────────
-- One row per movement behind member_balances. Positive = company owes the member.
-- Sum of amount per member always equals member_balances.balance.
create or replace view accounts.member_ledger with (security_invoker = true) as
select * from (
  select e.spent_by as member_id,
         e.spent_on as occurred_on,
         'expense'::text as entry_type,
         e.id as entity_id,
         case when not a.is_business then 'out_of_pocket'
              when e.nature = 'personal' then 'personal_on_business'
              else 'personal_portion' end as kind,
         e.vendor as label,
         e.description as detail,
         e.total_cad,
         case when not a.is_business
              then round(e.total_cad * (case e.nature when 'personal' then 0 else e.business_pct end) / 100, 2)
              else -round(e.total_cad * (100 - case e.nature when 'personal' then 0 else e.business_pct end) / 100, 2)
         end as amount,
         e.settled,
         e.settled_on,
         e.settlement_transfer_id,
         case when a.is_business then accounts.shareholder_loan_repay_by(e.spent_on) end as repay_by,
         e.created_at
  from accounts.expenses e join accounts.money_accounts a on a.id = e.paid_from_account_id
  union all
  select t.member_id, t.occurred_on, 'transfer', t.id, t.kind,
         initcap(t.kind), t.notes, t.amount,
         case t.kind when 'reimbursement' then -t.amount
                     when 'repayment'     then  t.amount
                     when 'contribution'  then  t.amount
                     else 0 end,
         true, t.occurred_on, null, null, t.created_at
  from accounts.member_transfers t
  union all
  select m.member_id, m.trip_on, 'mileage', m.id, 'mileage',
         coalesce(m.destination, 'Trip'), m.purpose, round(m.km * m.rate_per_km, 2),
         round(m.km * m.rate_per_km, 2),
         m.reimbursed, m.reimbursed_on, m.settlement_transfer_id, null, m.created_at
  from accounts.mileage_trips m
) l
where l.amount <> 0 or l.entry_type = 'transfer';

grant select on accounts.member_ledger to authenticated, service_role;
revoke execute on all functions in schema accounts from public, anon;
grant execute on all functions in schema accounts to authenticated, service_role;
grant execute on function accounts.public_invoice(text) to anon;
