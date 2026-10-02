-- Reference data: company profile, Canadian sales tax rates, CRA GIFI-mapped categories.
-- Idempotent: safe to re-run.

insert into accounts.business_profile (legal_name, operating_name, city, province, country, website, default_terms_days, payment_instructions)
values ('Tech Nerv Solutions Inc.', 'Tech Nerv', 'Kamloops', 'BC', 'CA', 'https://www.technerv.com', 15,
        'Interac e-Transfer or EFT. Please include the invoice number with your payment.')
on conflict (id) do nothing;

-- Rates current as of 2026. Place of supply decides which applies to a sale.
insert into accounts.tax_rates (code, name, rate, kind, province, is_recoverable) values
  ('GST',    'GST 5%',                 0.05, 'gst',    null, true),
  ('HST-ON', 'HST 13% (Ontario)',      0.13, 'hst',    'ON', true),
  ('HST-NS', 'HST 14% (Nova Scotia)',  0.14, 'hst',    'NS', true),
  ('HST-NB', 'HST 15% (New Brunswick)',0.15, 'hst',    'NB', true),
  ('HST-NL', 'HST 15% (Newfoundland)', 0.15, 'hst',    'NL', true),
  ('HST-PE', 'HST 15% (PEI)',          0.15, 'hst',    'PE', true),
  ('PST-BC', 'BC PST 7%',              0.07, 'pst',    'BC', false),
  ('ZERO',   'Zero-rated (export)',    0.00, 'zero',   null, true),
  ('EXEMPT', 'Exempt / no tax',        0.00, 'exempt', null, false)
on conflict (code) do update set name = excluded.name, rate = excluded.rate;

-- GIFI codes are the T2 line items; confirm the mapping with your accountant.
insert into accounts.categories (kind, name, gifi_code, deductible_pct, is_capital, cca_class, icon, sort) values
  ('income',  'Project revenue',               '8000', 100, false, null, 'briefcase', 1),
  ('income',  'Support & retainers',           '8000', 100, false, null, 'repeat', 2),
  ('income',  'Interest income',               '8090', 100, false, null, 'percent', 3),
  ('income',  'Other income',                  '8230', 100, false, null, 'plus', 4),
  ('expense', 'Software & subscriptions',      '9150', 100, false, null, 'app', 10),
  ('expense', 'Cloud, hosting & APIs',         '9150', 100, false, null, 'cloud', 11),
  ('expense', 'Internet & phone',              '9225', 100, false, null, 'phone', 12),
  ('expense', 'Advertising & marketing',       '8520', 100, false, null, 'megaphone', 13),
  ('expense', 'Meals & entertainment',         '8523',  50, false, null, 'fork', 14),
  ('expense', 'Travel',                        '9200', 100, false, null, 'plane', 15),
  ('expense', 'Vehicle & mileage',             '9281', 100, false, null, 'car', 16),
  ('expense', 'Office supplies',               '8811', 100, false, null, 'paperclip', 17),
  ('expense', 'Home office',                   '8910', 100, false, null, 'house', 18),
  ('expense', 'Professional fees (legal/accounting)', '8860', 100, false, null, 'scale', 19),
  ('expense', 'Subcontractors',                '8871', 100, false, null, 'people', 20),
  ('expense', 'Bank & card fees',              '8710', 100, false, null, 'bank', 21),
  ('expense', 'Insurance',                     '8690', 100, false, null, 'shield', 22),
  ('expense', 'Licences, dues & memberships',  '8760', 100, false, null, 'id', 23),
  ('expense', 'Training & education',          '9270', 100, false, null, 'book', 24),
  ('expense', 'Computer equipment (capital)',  '1774', 100, true,  '50', 'laptop', 25),
  ('expense', 'Furniture & equipment (capital)','1787', 100, true, '8', 'chair', 26),
  ('expense', 'Other expenses',                '9270', 100, false, null, 'tag', 99)
on conflict (kind, name) do nothing;
