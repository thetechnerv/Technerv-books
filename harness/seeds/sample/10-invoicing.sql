-- Invoicing sample extras (idempotent). Run after the generator:
--   node harness/bin/db.mjs file harness/seeds/sample/10-invoicing.sql
-- Activity triggers are paused so back-filling doesn't flood "Recent activity".

alter table accounts.invoices disable trigger t_invoices_activity;

-- Secondary detail lines on the PDF come from the catalogue description.
update accounts.invoice_lines l
   set detail = it.description
  from accounts.items it
 where it.id = l.item_id and l.detail is null and it.description is not null
   and l.description not ilike '%usage%'
   and not exists (select 1 from accounts.invoices i where i.id = l.invoice_id and i.kind = 'credit_note');

-- Credit notes describe their own reason; no catalogue detail.
update accounts.invoice_lines l set detail = null
  from accounts.invoices i, accounts.items it
 where i.id = l.invoice_id and i.kind = 'credit_note' and it.id = l.item_id and l.detail = it.description;

update accounts.invoice_lines l
   set detail = 'Twilio minutes and model usage, billed at cost'
 where l.detail is null and l.description ilike 'Telephony & AI usage%';

-- Monthly retainers belong to their client's recurring schedule.
update accounts.invoices i
   set recurring_id = r.id
  from accounts.recurring_invoices r
 where r.client_id = i.client_id and i.kind = 'invoice' and i.title like 'Retainer — %' and i.recurring_id is null;

update accounts.recurring_invoices r
   set template_invoice_id = (
     select i.id from accounts.invoices i
      where i.recurring_id = r.id and i.status <> 'void'
      order by i.issue_date desc, i.number desc limit 1)
 where r.template_invoice_id is null;

-- Payment terms on the estimates and credit note read better with a sentence.
update accounts.invoices
   set terms = 'This estimate is valid for 30 days. 50% deposit on acceptance, balance on launch.'
 where kind = 'estimate' and terms is null;

alter table accounts.invoices enable trigger t_invoices_activity;
