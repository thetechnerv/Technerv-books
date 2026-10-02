-- Banking: duplicate keys, rule suggestions, undo import, balances and reconciliation.
do $$
declare
  v_m uuid; v_acct uuid; v_batch uuid; v_exp uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_r1 uuid; v_r2 uuid;
  v_res jsonb; v_n int; v_bal numeric;
begin
  insert into accounts.members (full_name, email) values ('Test Banker', 'banker@test.local') returning id into v_m;
  insert into accounts.money_accounts (name, kind, opening_balance) values ('Test chequing', 'bank', 100) returning id into v_acct;

  -- 1. Normalised duplicate key ignores case, punctuation and spacing, but not amount or date.
  if accounts.normalise_bank_description('  Sq *Kamloops   coffee co. ') <> 'SQ KAMLOOPS COFFEE CO' then
    raise exception 'normalise_bank_description wrong: %', accounts.normalise_bank_description('  Sq *Kamloops   coffee co. ');
  end if;
  if accounts.bank_dedupe_hash(v_acct, '2026-09-22', -54.13, 'SQ *KAMLOOPS COFFEE CO') <> accounts.bank_dedupe_hash(v_acct, '2026-09-22', -54.130, 'sq kamloops coffee co ') then
    raise exception 'same row should hash the same';
  end if;
  if accounts.bank_dedupe_hash(v_acct, '2026-09-22', -54.13, 'X') = accounts.bank_dedupe_hash(v_acct, '2026-09-22', -54.14, 'X')
     or accounts.bank_dedupe_hash(v_acct, '2026-09-22', -54.13, 'X') = accounts.bank_dedupe_hash(v_acct, '2026-09-23', -54.13, 'X') then
    raise exception 'different amount/date must hash differently';
  end if;
  -- Matches the web app (sha256 of "account|yyyy-mm-dd|0.00|DESCRIPTION").
  if accounts.bank_dedupe_hash(v_acct, '2026-09-22', 5, 'x') <> encode(extensions.digest(v_acct::text || '|2026-09-22|5.00|X', 'sha256'), 'hex') then
    raise exception 'hash format drifted from the importer';
  end if;

  -- 2. Best rule: most specific text wins at equal priority; priority beats length.
  insert into accounts.rules (match_text, vendor_rename, priority) values ('ZZGOOGLE', 'Google', 0) returning id into v_r1;
  insert into accounts.rules (match_text, vendor_rename, priority) values ('ZZGOOGLE *ADS', 'Google Ads', 0) returning id into v_r2;
  if accounts.best_rule('ZZGOOGLE *ADS 123') <> v_r2 then raise exception 'longer rule should win'; end if;
  update accounts.rules set priority = 10 where id = v_r1;
  if accounts.best_rule('zzgoogle *ads 123') <> v_r1 then raise exception 'priority should win (and matching is case-insensitive)'; end if;

  -- 3. Import a small batch and pre-fill suggestions.
  insert into accounts.import_batches (account_id, file_name, rows_total, rows_imported, date_from, date_to)
    values (v_acct, 'test.csv', 3, 3, '2026-09-01', '2026-09-30') returning id into v_batch;
  insert into accounts.bank_transactions (account_id, posted_on, description, amount, dedupe_hash, import_batch)
    values (v_acct, '2026-09-02', 'ZZGOOGLE *ADS', -50, accounts.bank_dedupe_hash(v_acct, '2026-09-02', -50, 'ZZGOOGLE *ADS'), v_batch) returning id into v_t1;
  insert into accounts.bank_transactions (account_id, posted_on, description, amount, dedupe_hash, import_batch)
    values (v_acct, '2026-09-10', 'DEPOSIT', 500, accounts.bank_dedupe_hash(v_acct, '2026-09-10', 500, 'DEPOSIT'), v_batch) returning id into v_t2;
  insert into accounts.bank_transactions (account_id, posted_on, description, amount, dedupe_hash, import_batch, status)
    values (v_acct, '2026-10-03', 'FEE', -5, accounts.bank_dedupe_hash(v_acct, '2026-10-03', -5, 'FEE'), v_batch, 'ignored') returning id into v_t3;

  -- The unique key rejects the same row twice in one account.
  begin
    insert into accounts.bank_transactions (account_id, posted_on, description, amount, dedupe_hash)
      values (v_acct, '2026-09-02', 'zzgoogle  *ads', -50, accounts.bank_dedupe_hash(v_acct, '2026-09-02', -50, 'zzgoogle  *ads'));
    raise exception 'duplicate row was accepted';
  exception when unique_violation then null;
  end;

  v_n := accounts.apply_rules_to_unreviewed(v_acct);
  if v_n <> 1 or (select rule_id from accounts.bank_transactions where id = v_t1) <> v_r1 then raise exception 'apply_rules_to_unreviewed: % suggestions', v_n; end if;

  -- 4. Balances: opening 100 + amounts up to the day.
  v_bal := accounts.account_balance_at(v_acct, '2026-09-30');
  if v_bal <> 550 then raise exception 'balance at Sep 30 should be 550, got %', v_bal; end if;
  if accounts.account_balance_at(v_acct, '2026-08-31') <> 100 then raise exception 'opening balance only before the first row'; end if;

  -- 5. Reconciliation: one per account and month end.
  insert into accounts.reconciliations (account_id, period_end, statement_balance, computed_balance, reconciled_by)
    values (v_acct, '2026-09-30', 550, v_bal, v_m);
  begin
    insert into accounts.reconciliations (account_id, period_end, statement_balance, computed_balance) values (v_acct, '2026-09-30', 1, 1);
    raise exception 'second reconciliation for the same month was accepted';
  exception when unique_violation then null;
  end;

  -- 6. Undo import keeps rows linked to records, removes the rest, keeps the batch while anything is left.
  insert into accounts.expenses (vendor, spent_by, paid_from_account_id, total, bank_transaction_id)
    values ('Google Ads', v_m, v_acct, 50, v_t1) returning id into v_exp;
  update accounts.bank_transactions set status = 'created', matched_expense_id = v_exp where id = v_t1;
  v_res := accounts.undo_import(v_batch);
  if (v_res ->> 'deleted')::int <> 2 or (v_res ->> 'kept')::int <> 1 or (v_res ->> 'batch_deleted')::boolean then
    raise exception 'undo_import first pass wrong: %', v_res;
  end if;
  if not exists (select 1 from accounts.bank_transactions where id = v_t1) or exists (select 1 from accounts.bank_transactions where id in (v_t2, v_t3)) then
    raise exception 'undo_import removed the wrong rows';
  end if;
  if (select rows_imported from accounts.import_batches where id = v_batch) <> 1 then raise exception 'batch count not updated'; end if;

  -- Unmatched, the last row goes too and so does the batch.
  update accounts.bank_transactions set status = 'unreviewed', matched_expense_id = null where id = v_t1;
  v_res := accounts.undo_import(v_batch);
  if not (v_res ->> 'batch_deleted')::boolean or exists (select 1 from accounts.import_batches where id = v_batch) then
    raise exception 'undo_import should remove an empty batch: %', v_res;
  end if;
  -- The expense survives; its link is cleared by the FK.
  if (select bank_transaction_id from accounts.expenses where id = v_exp) is not null then raise exception 'expense link should be cleared'; end if;
end $$;
