-- Business vs personal spending and who-owes-whom.
do $$
declare v_m uuid; v_card uuid; v_personal uuid; v_cat uuid; b numeric;
begin
  insert into accounts.members (full_name, email) values ('Test Owner', 'owner@test.local') returning id into v_m;
  insert into accounts.money_accounts (name, kind, is_business) values ('Biz card', 'credit_card', true) returning id into v_card;
  insert into accounts.money_accounts (name, kind, is_business, owner_member_id) values ('Owner personal', 'personal', false, v_m) returning id into v_personal;
  select id into v_cat from accounts.categories where name = 'Meals & entertainment';

  -- 1. Business lunch on personal card: company owes owner 80
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, gst_hst, category_id)
    values ('Cafe', v_m, v_personal, 80, 3.81, v_cat);
  -- 2. Personal groceries on business card: owner owes company 50
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, nature)
    values ('Grocer', v_m, v_card, 50, 'personal');
  -- 3. Phone bill 60% business on business card: owner owes company 40% of 100
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, nature, business_pct)
    values ('Telus', v_m, v_card, 100, 'mixed', 60);

  select balance into b from accounts.member_balances where member_id = v_m;
  if b <> -10 then raise exception 'expected -10 (80 - 50 - 40), got %', b; end if;

  -- Meals: half deductible, half ITC
  if (select deductible_cad from accounts.expense_overview where vendor = 'Cafe') <> 40 then raise exception 'meals 50%% wrong'; end if;
  if (select itc_cad from accounts.expense_overview where vendor = 'Cafe') <> 1.91 then raise exception 'meals ITC wrong'; end if;

  -- Owner repays the 10
  insert into accounts.member_transfers (member_id, kind, amount) values (v_m, 'repayment', 10);
  select balance into b from accounts.member_balances where member_id = v_m;
  if b <> 0 then raise exception 'expected settled 0, got %', b; end if;
end $$;
