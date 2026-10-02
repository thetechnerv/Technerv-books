-- 31 — FY2025 year-end clean-up: each owner repaid the personal share of
-- mixed bills paid with business money, so no shareholder loan is carried
-- past its s.15(2) repay-by date. FY2026 personal shares stay open on purpose.
-- Idempotent.
do $$
declare m record; v_id uuid; v_amt numeric;
begin
  for m in select id, full_name from accounts.members loop
    v_id := md5('sample:fy2025-repayment:' || m.id)::uuid;
    if exists (select 1 from accounts.member_transfers where id = v_id) then continue; end if;
    select round(sum(e.total_cad * (100 - case e.nature when 'personal' then 0 else e.business_pct end) / 100), 2)
      into v_amt
      from accounts.expenses e join accounts.money_accounts a on a.id = e.paid_from_account_id
     where a.is_business and e.spent_by = m.id and not e.settled and e.spent_on <= '2025-09-30'
       and (e.nature = 'personal' or e.business_pct < 100);
    if coalesce(v_amt, 0) <= 0 then continue; end if;
    insert into accounts.member_transfers (id, member_id, occurred_on, kind, amount, account_id, notes, created_at)
    values (v_id, m.id, '2025-12-15', 'repayment', v_amt,
            (select id from accounts.money_accounts where name = 'EQ Bank Business'),
            'FY2025 year-end: personal share of mixed bills paid by the company', '2025-12-15T20:00:00Z');
    update accounts.expenses e set settled = true, settled_on = '2025-12-15', settlement_transfer_id = v_id
      from accounts.money_accounts a
     where a.id = e.paid_from_account_id and a.is_business and e.spent_by = m.id and not e.settled
       and e.spent_on <= '2025-09-30' and (e.nature = 'personal' or e.business_pct < 100);
  end loop;
end $$;
