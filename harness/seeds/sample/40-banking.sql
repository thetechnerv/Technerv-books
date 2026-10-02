-- 40 — Banking sample extras (idempotent; run after generate.mjs).
--  · Rule suggestions on the unreviewed queue, as the importer would have set them.
--  · Earlier sample batches are CSV imports.
--  · August 2026 reconciled for the CAD bank account and the card, so the
--    reconcile screen shows both a closed month and an open one.

select accounts.apply_rules_to_unreviewed();

update accounts.import_batches set file_format = 'csv' where file_format is null;

insert into accounts.reconciliations (account_id, period_end, statement_balance, computed_balance, reconciled_by, reconciled_at, notes)
select a.id, date '2026-08-31',
       accounts.account_balance_at(a.id, date '2026-08-31'),
       accounts.account_balance_at(a.id, date '2026-08-31'),
       (select id from accounts.members order by full_name limit 1),
       timestamptz '2026-09-04 17:30:00+00',
       'Matches the August statement.'
from accounts.money_accounts a
where a.kind in ('bank', 'credit_card') and a.currency = 'CAD'
  and exists (select 1 from accounts.bank_transactions t where t.account_id = a.id and t.posted_on <= date '2026-08-31')
on conflict (account_id, period_end) do nothing;
