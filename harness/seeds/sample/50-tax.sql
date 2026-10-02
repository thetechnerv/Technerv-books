-- 50 — Tax Centre / Documents sample data (idempotent; runs after the generator).
-- The September EQ Bank statement belongs to the CAD operating account.
update accounts.documents d
   set account_id = a.id, period_start = date '2026-09-01', period_end = date '2026-09-30'
  from accounts.money_accounts a
 where a.name = 'EQ Bank Business' and d.title = 'EQ Bank statement — Sept 2026' and d.account_id is null;

-- Link the filed FY2025 returns to their copies in the vault.
update accounts.tax_filings f set document_id = d.id
  from accounts.documents d
 where f.document_id is null and f.period_end = date '2025-09-30'
   and ((f.kind = 'gst' and d.title = 'GST/HST return FY2025') or (f.kind = 't2' and d.title = 'T2 corporate return FY2025'));
