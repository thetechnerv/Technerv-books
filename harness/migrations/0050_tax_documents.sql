-- 0050 — Tax Centre & records vault.
--  · documents: which bank/card account a statement belongs to and the period
--    it covers, so the statements tracker can tell which months are on file.
--  · documents.doc_type is constrained to the vault's types.
--  · tax_filings: link to the filed return in Documents, worksheet overrides
--    (GST34 lines 104/107/110/111 typed in by the user), who filed it.

alter table accounts.documents
  add column account_id   uuid references accounts.money_accounts(id) on delete set null,
  add column period_start date,
  add column period_end   date,
  add column updated_at   timestamptz not null default now(),
  add constraint documents_doc_type_check check (doc_type in
    ('corporate', 'gst_return', 't2_return', 'notice_of_assessment', 'contract', 'insurance', 'statement', 'other')),
  add constraint documents_period_check check (period_start is null or period_end is null or period_start <= period_end);

create index if not exists documents_fiscal_year_idx on accounts.documents (fiscal_year, doc_type);
create index if not exists documents_statement_idx on accounts.documents (account_id, period_start) where doc_type = 'statement';
create trigger t_documents_touch before update on accounts.documents for each row execute function accounts.touch_updated_at();

alter table accounts.tax_filings
  add column document_id uuid references accounts.documents(id) on delete set null,
  add column worksheet   jsonb not null default '{}',
  add column filed_by    uuid references accounts.members(id) on delete set null,
  add column created_at  timestamptz not null default now(),
  add constraint tax_filings_period_check check (period_start <= period_end);

grant all on all tables in schema accounts to authenticated, service_role;
