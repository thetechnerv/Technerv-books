-- 0012 — replace_invoice_lines: WITH ORDINALITY can't combine with a column
-- definition list, so expand the array first and read fields from each element.
create or replace function accounts.replace_invoice_lines(p_invoice uuid, p_lines jsonb) returns void
language plpgsql set search_path = accounts as $$
begin
  delete from invoice_lines where invoice_id = p_invoice;
  insert into invoice_lines (invoice_id, sort, item_id, description, detail, quantity, unit, unit_price, tax_rate_id)
  select p_invoice,
         coalesce((e.val ->> 'sort')::int, (e.ord - 1)::int),
         nullif(e.val ->> 'item_id', '')::uuid,
         e.val ->> 'description',
         nullif(e.val ->> 'detail', ''),
         coalesce((e.val ->> 'quantity')::numeric, 1),
         nullif(e.val ->> 'unit', ''),
         coalesce((e.val ->> 'unit_price')::numeric, 0),
         nullif(e.val ->> 'tax_rate_id', '')::uuid
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as e(val, ord);
  perform recalc_invoice(p_invoice);
end $$;
revoke execute on function accounts.replace_invoice_lines(uuid, jsonb) from public, anon;
grant execute on function accounts.replace_invoice_lines(uuid, jsonb) to authenticated, service_role;
