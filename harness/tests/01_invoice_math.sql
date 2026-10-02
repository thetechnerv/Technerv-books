-- Invoice totals, numbering and payment status flow.
do $$
declare v_client uuid; v_inv uuid; v_pay uuid; v_num text; r record;
begin
  insert into accounts.clients (display_name, province) values ('Test Client', 'ON') returning id into v_client;
  v_num := accounts.next_document_number('invoice');
  insert into accounts.invoices (number, client_id, status, due_date) values (v_num, v_client, 'sent', current_date - 3) returning id into v_inv;
  insert into accounts.invoice_lines (invoice_id, description, quantity, unit_price, tax_rate_id)
    values (v_inv, 'Voice AI build', 1, 4000, (select id from accounts.tax_rates where code = 'HST-ON')),
           (v_inv, 'Support hours', 2.5, 120, (select id from accounts.tax_rates where code = 'HST-ON'));
  select * into r from accounts.invoices where id = v_inv;
  if r.subtotal <> 4300 or r.tax_total <> 559 or r.total <> 4859 then
    raise exception 'totals wrong: % % %', r.subtotal, r.tax_total, r.total;
  end if;
  if not (select is_overdue from accounts.invoice_overview where id = v_inv) then raise exception 'should be overdue'; end if;

  insert into accounts.payments (client_id, amount) values (v_client, 2000) returning id into v_pay;
  insert into accounts.payment_allocations (payment_id, invoice_id, amount) values (v_pay, v_inv, 2000);
  select * into r from accounts.invoices where id = v_inv;
  if r.status <> 'partial' or r.balance <> 2859 then raise exception 'partial wrong: % %', r.status, r.balance; end if;

  update accounts.payment_allocations set amount = 4859 where payment_id = v_pay;
  if (select status from accounts.invoices where id = v_inv) <> 'paid' then raise exception 'should be paid'; end if;

  delete from accounts.payment_allocations where payment_id = v_pay;
  if (select status from accounts.invoices where id = v_inv) <> 'sent' then raise exception 'should revert to sent'; end if;
end $$;
