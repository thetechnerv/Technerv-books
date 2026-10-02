-- 20 — Clients & projects sample enrichment. Idempotent: safe to re-run after the generator.
-- Adds the details a real client list accumulates: CC'd accounts-payable inboxes, billing notes,
-- project notes, a pipeline project, and one archived client that never went ahead.

update accounts.clients set cc_emails = array['accounting@harbourview.example']
  where display_name = 'Harbourview Property Mgmt' and cc_emails = '{}';
update accounts.clients set cc_emails = array['kara@summitfield.example']
  where display_name = 'Summit Field Services' and cc_emails = '{}';
update accounts.clients set cc_emails = array['jordan@okanaganlegal.example']
  where display_name = 'Okanagan Legal LLP' and cc_emails = '{}';

update accounts.clients set notes = 'AP runs cheques on the 15th and 30th — invoices received after the 10th go in the next run. Always quote the PO number.'
  where display_name = 'Harbourview Property Mgmt' and notes is null;
update accounts.clients set notes = 'Monthly retainer on the 1st. Usage pass-through is at cost (Twilio + model usage); attach the usage export if asked.'
  where display_name = 'Riverbend Family Clinic' and notes is null;
update accounts.clients set notes = 'Pays by wire in USD. Zero-rated export — keep their W-9 and the Seattle address on file as proof of non-residency.'
  where display_name = 'Cascadia Wellness Co.' and notes is null;
update accounts.clients set notes = 'Retainer overdue since August. Priya said the clinic changed bookkeepers — follow up with the new office manager.'
  where display_name = 'Maple & Main Dental' and notes is null;
update accounts.clients set notes = 'Hourly work billed monthly in arrears. Jordan approves anything over 10 hours in advance.'
  where display_name = 'Okanagan Legal LLP' and notes is null;

update accounts.projects set notes = 'Scope: after-hours call answering for tenant emergencies, escalation to on-call staff, Yardi ticket creation. Voice persona recorded Aug 11.'
  where name = 'After-hours Voice Line' and notes is null;
update accounts.projects set notes = 'Member FAQ, class bookings and membership upgrades. Final invoice drafted for launch week.'
  where name = 'Member Concierge Chatbot' and notes is null;
update accounts.projects set notes = 'Searches 12 years of precedents and memos with cited answers. Phase 2: matter intake connector (billed hourly).'
  where name = 'Precedent Search Assistant' and notes is null;

-- Pipeline project for the draft estimate (not linked to any invoice, so no totals change).
insert into accounts.projects (id, client_id, name, status, budget, started_on, notes)
select '2a0c5d1e-7b3f-4c19-9e84-20c11e000001', c.id, 'Lead follow-up pilot', 'lead', 5250.00, '2026-09-29',
       'Single-location pilot at the Vernon lot. Estimate EST-1011 drafted; waiting on their GM.'
from accounts.clients c where c.display_name = 'Lakeside Auto Group'
on conflict (id) do nothing;

-- A client that never went ahead: archived, no invoices.
insert into accounts.clients (id, display_name, company_name, contact_name, email, phone, address_line1, city, province, postal_code, country,
                              currency, default_tax_rate_id, terms_days, notes, archived, created_at)
select '2a0c5d1e-7b3f-4c19-9e84-20c11e000002', 'Sun Peaks Adventure Co.', 'Sun Peaks Adventure Company Ltd.', 'Nadia Brennan',
       'nadia@sunpeaksadventure.example', '(250) 555-0139', '3250 Village Way', 'Sun Peaks', 'BC', 'V0E 5N0', 'CA',
       'CAD', t.id, null, 'Wanted a booking chatbot for the 2025–26 season; went with an off-the-shelf widget. Revisit next spring.', true, '2025-03-18T17:00:00Z'
from accounts.tax_rates t where t.code = 'GST'
on conflict (id) do nothing;
