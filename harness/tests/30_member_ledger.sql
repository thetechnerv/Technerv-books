-- Owner ledger, settlement links, s.15(2) repay-by dates and the mileage tiers.
do $$
declare
  v_m uuid; v_card uuid; v_personal uuid; v_t uuid; v_e1 uuid; v_e2 uuid; v_trip uuid; v_rate numeric; r record; b numeric;
begin
  -- Every member's ledger sums to their balance (sample data included).
  for r in
    select mb.member_id, mb.balance, coalesce((select sum(amount) from accounts.member_ledger l where l.member_id = mb.member_id), 0) as ledger
    from accounts.member_balances mb
  loop
    if r.balance <> r.ledger then raise exception 'ledger % <> balance % for %', r.ledger, r.balance, r.member_id; end if;
  end loop;

  insert into accounts.members (full_name, email) values ('Ledger Owner', 'ledger@test.local') returning id into v_m;
  insert into accounts.money_accounts (name, kind, is_business) values ('Biz card', 'credit_card', true) returning id into v_card;
  insert into accounts.money_accounts (name, kind, is_business, owner_member_id) values ('Own card', 'personal', false, v_m) returning id into v_personal;

  -- 120 business on personal card (+120), 30 personal on business card (−30), phone 70% business on business card (−15 of 50)
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, spent_on) values ('Staples', v_m, v_personal, 120, '2026-03-01') returning id into v_e1;
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, nature, spent_on) values ('Grocer', v_m, v_card, 30, 'personal', '2026-09-12') returning id into v_e2;
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, nature, business_pct, spent_on) values ('Telus', v_m, v_card, 50, 'mixed', 70, '2026-10-01');
  -- A business expense on the business card doesn't touch the ledger.
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total) values ('Vercel', v_m, v_card, 20);

  if (select count(*) from accounts.member_ledger where member_id = v_m) <> 3 then raise exception 'expected 3 ledger rows'; end if;
  if (select sum(amount) from accounts.member_ledger where member_id = v_m) <> 75 then raise exception 'ledger should be 75'; end if;
  if (select kind from accounts.member_ledger where entity_id = v_e2) <> 'personal_on_business' then raise exception 'kind wrong'; end if;

  -- Repay-by = one year after the fiscal year-end (Sept 30) of the year the loan arose.
  if (select repay_by from accounts.member_ledger where entity_id = v_e2) <> '2027-09-30' then raise exception 'repay-by FY2026 wrong'; end if;
  if (select repay_by from accounts.member_ledger where label = 'Telus' and member_id = v_m) <> '2028-09-30' then raise exception 'repay-by FY2027 wrong'; end if;
  if (select repay_by from accounts.member_ledger where entity_id = v_e1) is not null then raise exception 'out-of-pocket has no repay-by'; end if;
  if accounts.fiscal_year_end_on('2026-09-30') <> '2026-09-30' or accounts.fiscal_year_end_on('2026-10-01') <> '2027-09-30' then
    raise exception 'fiscal_year_end_on wrong';
  end if;

  -- Mileage: rate is stored per trip; 0.72 under 5,000 km, blended across the threshold.
  -- Pin the rates so the test doesn't depend on the current settings.
  update accounts.business_profile set mileage_rate = 0.72, mileage_rate_after_5000 = 0.66;
  v_rate := accounts.mileage_rate_for(v_m, '2026-05-01', 100);
  if v_rate <> 0.72 then raise exception 'first-tier rate %', v_rate; end if;
  insert into accounts.mileage_trips (member_id, trip_on, purpose, km, rate_per_km) values (v_m, '2026-05-01', 'Client', 4900, 0.72) returning id into v_trip;
  -- next 200 km: 100 @ 0.72 + 100 @ 0.66 = 138 → 0.69/km
  v_rate := accounts.mileage_rate_for(v_m, '2026-06-01', 200);
  if v_rate <> 0.69 then raise exception 'blended rate %', v_rate; end if;
  -- editing the 4,900 km trip ignores itself
  if accounts.mileage_rate_for(v_m, '2026-05-01', 4900, v_trip) <> 0.72 then raise exception 'exclude self failed'; end if;
  -- new calendar year resets the tier
  if accounts.mileage_rate_for(v_m, '2027-01-05', 200) <> 0.72 then raise exception 'calendar reset failed'; end if;

  select balance into b from accounts.member_balances where member_id = v_m;
  if b <> 75 + 3528 then raise exception 'balance with mileage %', b; end if;

  -- Settle: reimbursement linked to the items it covered.
  insert into accounts.member_transfers (member_id, kind, amount) values (v_m, 'reimbursement', 3648) returning id into v_t;
  update accounts.expenses set settled = true, settled_on = current_date, settlement_transfer_id = v_t where id = v_e1;
  update accounts.mileage_trips set reimbursed = true, reimbursed_on = current_date, settlement_transfer_id = v_t where id = v_trip;
  select balance into b from accounts.member_balances where member_id = v_m;
  if b <> -45 then raise exception 'after reimbursement expected -45, got %', b; end if;
  if (select sum(amount) from accounts.member_ledger where member_id = v_m) <> b then raise exception 'ledger drifted from balance'; end if;

  -- Deleting the transfer re-opens exactly what it covered.
  delete from accounts.member_transfers where id = v_t;
  if (select settled from accounts.expenses where id = v_e1) then raise exception 'expense should re-open'; end if;
  if (select reimbursed from accounts.mileage_trips where id = v_trip) then raise exception 'trip should re-open'; end if;
  if (select settlement_transfer_id from accounts.expenses where id = v_e1) is not null then raise exception 'link should clear'; end if;
end $$;
