-- 30 — Expenses, owner balances, subscriptions & mileage sample extras.
-- Idempotent: safe to run again after `generate.mjs`.

-- ───────────── Mileage: the generated trips are there-and-back from the office ─────────────
update accounts.mileage_trips set round_trip = true
where origin = 'Tech Nerv office, Kamloops' and not round_trip;

-- ───────────── Subscriptions keep their PST (from the last logged charge) ─────────────
update accounts.recurring_expenses r set pst = last.pst
from (
  select distinct on (recurring_expense_id) recurring_expense_id, pst
  from accounts.expenses where recurring_expense_id is not null
  order by recurring_expense_id, spent_on desc
) last
where last.recurring_expense_id = r.id and r.pst = 0 and last.pst <> 0;

-- ───────────── Link past settlements to the transfers that paid them ─────────────
-- Out-of-pocket reimbursements ("Out-of-pocket expenses to <date>")
update accounts.expenses e set settlement_transfer_id = t.id
from accounts.member_transfers t, accounts.money_accounts a
where a.id = e.paid_from_account_id and not a.is_business
  and e.settled and e.settlement_transfer_id is null
  and t.member_id = e.spent_by and t.kind = 'reimbursement' and t.occurred_on = e.settled_on
  and t.notes like 'Out-of-pocket expenses to %';

-- Mileage reimbursements ("Mileage to <quarter end>") cover trips in that quarter
update accounts.mileage_trips m set settlement_transfer_id = t.id, reimbursed_on = t.occurred_on
from accounts.member_transfers t
where m.reimbursed and m.settlement_transfer_id is null
  and t.member_id = m.member_id and t.kind = 'reimbursement' and t.notes like 'Mileage to %'
  and m.trip_on <= substring(t.notes from 12)::date and m.trip_on > substring(t.notes from 12)::date - 92;

-- Gursahib's groceries on the business card, repaid Feb 2025
update accounts.expenses e set settlement_transfer_id = t.id, settled = true, settled_on = t.occurred_on
from accounts.member_transfers t
where t.kind = 'repayment' and t.notes = 'Groceries on business card' and t.member_id = e.spent_by
  and e.nature = 'personal' and e.total = t.amount and e.settlement_transfer_id is null;

-- ───────────── A few fresh rows showing each case ─────────────
do $$
declare
  ds uuid := (select id from accounts.members where initials = 'DS');
  gs uuid := (select id from accounts.members where initials = 'GS');
  card uuid := (select id from accounts.money_accounts where kind = 'credit_card' and is_business limit 1);
  eq uuid := (select id from accounts.money_accounts where kind = 'bank' and currency = 'CAD' limit 1);
  ds_own uuid := (select id from accounts.money_accounts where kind = 'personal' and owner_member_id = (select id from accounts.members where initials = 'DS'));
  office uuid := (select id from accounts.categories where kind = 'expense' and name = 'Office supplies');
  other uuid := (select id from accounts.categories where kind = 'expense' and name = 'Other expenses');
  software uuid := (select id from accounts.categories where kind = 'expense' and name = 'Software & subscriptions');
  t uuid;
begin
  if ds is null or gs is null or card is null then return; end if;

  -- Business, paid personally → company owes Deeparsh, then reimbursed
  if not exists (select 1 from accounts.expenses where vendor = 'Staples' and spent_on = '2026-10-01' and spent_by = ds) then
    insert into accounts.expenses (id, spent_on, vendor, description, category_id, spent_by, paid_from_account_id, nature, business_pct, total, gst_hst, pst, subtotal)
    values ('a768fa1c-2752-4042-ad90-a67dc5775658', '2026-10-01', 'Staples', 'Printer paper and toner', office, ds, ds_own, 'business', 100, 56, 2.5, 3.5, 50);
    insert into accounts.member_transfers (member_id, occurred_on, kind, amount, account_id) values (ds, '2026-10-02', 'reimbursement', 56, eq) returning id into t;
    update accounts.expenses set settled = true, settled_on = '2026-10-02', settlement_transfer_id = t where id = 'a768fa1c-2752-4042-ad90-a67dc5775658';
  end if;

  -- Personal on the business card → shareholder loan, repaid the next day
  if not exists (select 1 from accounts.expenses where vendor = 'Save-On-Foods' and spent_on = '2026-10-01' and spent_by = gs) then
    insert into accounts.expenses (id, spent_on, vendor, description, category_id, spent_by, paid_from_account_id, nature, business_pct, total, subtotal)
    values ('5be00ae7-970c-4582-9261-ee9bba350367', '2026-10-01', 'Save-On-Foods', 'Groceries — wrong card', other, gs, card, 'personal', 0, 43.2, 43.2);
    insert into accounts.member_transfers (member_id, occurred_on, kind, amount, account_id, notes) values (gs, '2026-10-02', 'repayment', 43.2, eq, 'Groceries on the wrong card') returning id into t;
    update accounts.expenses set settled = true, settled_on = '2026-10-02', settlement_transfer_id = t where id = '5be00ae7-970c-4582-9261-ee9bba350367';
  end if;

  -- Mixed 60% on the business card → 40% owed by Deeparsh (open)
  if not exists (select 1 from accounts.expenses where vendor = 'Best Buy' and spent_on = '2026-10-02' and spent_by = ds) then
    insert into accounts.expenses (id, spent_on, vendor, description, category_id, spent_by, paid_from_account_id, nature, business_pct, total, gst_hst, pst, subtotal, tags)
    values ('64224242-a3f5-40a8-9ef9-f943a5ea6019', '2026-10-02', 'Best Buy', 'Headphones — 60% work calls', office, ds, card, 'mixed', 60, 226.8, 10.13, 14.17, 202.5, array['gear']);
  end if;

  -- USD on the business card at the Bank of Canada rate
  if not exists (select 1 from accounts.expenses where vendor = 'Cursor' and spent_by = ds) then
    insert into accounts.expenses (id, spent_on, vendor, description, category_id, spent_by, paid_from_account_id, currency, total, subtotal, fx_rate, tags)
    values ('0e94b305-c024-4c19-ae2d-7e115fdd981f', '2026-09-28', 'Cursor', 'Pro plan — Deeparsh seat', software, ds, card, 'USD', 20, 20, 1.4168, array['ai-tools']);
  end if;
  insert into accounts.fx_rates (currency, rate_date, rate_to_cad) values ('USD', '2026-09-28', 1.4168) on conflict do nothing;

  -- A round trip not reimbursed yet
  if not exists (select 1 from accounts.mileage_trips where destination = 'Sun Peaks Resort' and member_id = gs) then
    insert into accounts.mileage_trips (member_id, trip_on, origin, destination, purpose, km, round_trip, rate_per_km)
    values (gs, '2026-10-01', 'Tech Nerv office, Kamloops', 'Sun Peaks Resort', 'Discovery meeting — booking chatbot', 110, true, 0.72);
  end if;
end $$;
