-- 0010 — invoicing: credit-note numbers, line detail text, discount-aware tax,
-- atomic line replacement, revision snapshots and recurring links.

-- ───────────── Credit-note numbering ─────────────
-- Credit notes share the invoice sequence (so numbers never collide across a
-- client's statement) but carry their own prefix: TN-1015, CN-1016, TN-1017 …
alter table accounts.business_profile
  add column if not exists credit_note_prefix text not null default 'CN-';

create or replace function accounts.next_document_number(p_kind accounts.invoice_kind)
returns text language plpgsql set search_path = accounts as $$
declare v text;
begin
  if p_kind = 'estimate' then
    update business_profile set next_estimate_seq = next_estimate_seq + 1
      returning estimate_prefix || (next_estimate_seq - 1) into v;
  elsif p_kind = 'credit_note' then
    update business_profile set next_invoice_seq = next_invoice_seq + 1
      returning credit_note_prefix || (next_invoice_seq - 1) into v;
  else
    update business_profile set next_invoice_seq = next_invoice_seq + 1
      returning invoice_prefix || (next_invoice_seq - 1) into v;
  end if;
  return v;
end $$;

-- ───────────── Line detail ─────────────
-- Secondary line under the description on the PDF ("Design, build, telephony integration and launch").
alter table accounts.invoice_lines add column if not exists detail text;

-- ───────────── Totals ─────────────
-- A discount reduces the taxable amount (CRA: tax is charged on the discounted
-- consideration), so it's spread pro rata across lines before tax is worked out.
create or replace function accounts.recalc_invoice(p_invoice uuid) returns void
language plpgsql set search_path = accounts as $$
declare v_sub numeric(14,2); v_tax numeric(14,2); v_disc numeric(14,2); v_factor numeric;
begin
  select coalesce(sum(l.amount), 0) into v_sub from invoice_lines l where l.invoice_id = p_invoice;
  select least(greatest(discount, 0), greatest(v_sub, 0)) into v_disc from invoices where id = p_invoice;
  v_disc := coalesce(v_disc, 0);
  v_factor := case when v_sub > 0 then 1 - v_disc / v_sub else 1 end;
  select coalesce(sum(round(l.amount * v_factor * coalesce(t.rate, 0), 2)), 0)
    into v_tax
    from invoice_lines l left join tax_rates t on t.id = l.tax_rate_id
   where l.invoice_id = p_invoice;
  update invoices set subtotal = v_sub, tax_total = v_tax, total = v_sub - v_disc + v_tax
   where id = p_invoice;
end $$;

-- Changing only the discount must also refresh the totals.
create or replace function accounts.on_invoice_discount_change() returns trigger language plpgsql as $$
begin
  perform accounts.recalc_invoice(new.id);
  return null;
end $$;
drop trigger if exists t_invoices_discount on accounts.invoices;
create trigger t_invoices_discount after update of discount on accounts.invoices
  for each row when (old.discount is distinct from new.discount)
  execute function accounts.on_invoice_discount_change();

-- ───────────── Atomic line replacement ─────────────
-- The editor saves the whole line list at once; doing it in one function keeps
-- the invoice from ever being seen half-written.
create or replace function accounts.replace_invoice_lines(p_invoice uuid, p_lines jsonb) returns void
language plpgsql set search_path = accounts as $$
begin
  delete from invoice_lines where invoice_id = p_invoice;
  insert into invoice_lines (invoice_id, sort, item_id, description, detail, quantity, unit, unit_price, tax_rate_id)
  select p_invoice, coalesce(r.sort, (ord - 1)::int), r.item_id, r.description, nullif(r.detail, ''), coalesce(r.quantity, 1),
         nullif(r.unit, ''), coalesce(r.unit_price, 0), r.tax_rate_id
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) with ordinality
         as r(sort int, item_id uuid, description text, detail text, quantity numeric, unit text, unit_price numeric, tax_rate_id uuid, ord bigint);
  perform recalc_invoice(p_invoice);
end $$;

-- ───────────── Revision snapshots ─────────────
-- Same shape as the sample revisions: { invoice, lines, client }.
create or replace function accounts.invoice_snapshot(p_invoice uuid) returns jsonb
language sql stable set search_path = accounts as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort) from invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'client', (select to_jsonb(c) from clients c where c.id = i.client_id))
  from invoices i where i.id = p_invoice;
$$;

-- ───────────── Recurring link ─────────────
create index if not exists invoices_client_issue_idx on accounts.invoices (client_id, issue_date desc);
create index if not exists invoices_recurring_idx on accounts.invoices (recurring_id);
do $$ begin
  alter table accounts.invoices add constraint invoices_recurring_fk
    foreign key (recurring_id) references accounts.recurring_invoices(id) on delete set null;
exception when duplicate_object then null; end $$;

revoke execute on function accounts.replace_invoice_lines(uuid, jsonb) from public, anon;
revoke execute on function accounts.invoice_snapshot(uuid) from public, anon;
revoke execute on function accounts.on_invoice_discount_change() from public, anon;
grant execute on function accounts.replace_invoice_lines(uuid, jsonb) to authenticated, service_role;
grant execute on function accounts.invoice_snapshot(uuid) to authenticated, service_role;
grant execute on function accounts.next_document_number(accounts.invoice_kind) to authenticated, service_role;
