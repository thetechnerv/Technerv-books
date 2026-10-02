-- 0011 — next_document_number via PostgREST: pg_safeupdate rejects an UPDATE
-- without a WHERE clause, so target the single profile row explicitly.
create or replace function accounts.next_document_number(p_kind accounts.invoice_kind)
returns text language plpgsql set search_path = accounts as $$
declare v text;
begin
  if p_kind = 'estimate' then
    update business_profile set next_estimate_seq = next_estimate_seq + 1 where id
      returning estimate_prefix || (next_estimate_seq - 1) into v;
  elsif p_kind = 'credit_note' then
    update business_profile set next_invoice_seq = next_invoice_seq + 1 where id
      returning credit_note_prefix || (next_invoice_seq - 1) into v;
  else
    update business_profile set next_invoice_seq = next_invoice_seq + 1 where id
      returning invoice_prefix || (next_invoice_seq - 1) into v;
  end if;
  return v;
end $$;
revoke execute on function accounts.next_document_number(accounts.invoice_kind) from public, anon;
grant execute on function accounts.next_document_number(accounts.invoice_kind) to authenticated, service_role;
