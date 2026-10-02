// Synthetic demo dataset for Tech Nerv Accounts.
// Deterministic: the same seed always produces the same books, so screenshots
// and tests stay stable. Covers FY2025 (Oct 2024–Sep 2025), FY2026 and the
// first days of FY2027, ending "today" (2026-10-02).
//
// Everything here is fictional. `npm run db -- fresh-start --yes` removes it.

import { createHash } from 'node:crypto';
import { receiptSvg, simplePdf } from './files.mjs';

const TODAY = '2026-10-02';

// ───────────── deterministic helpers ─────────────
let seed = 20261002;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const money = (n) => Math.round(n * 100) / 100;
const uuid = (label) => {
  const h = createHash('sha1').update('technerv-sample:' + label).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const addDays = (iso, d) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const nextMonth = (iso) => { const [y, m, d] = iso.split('-').map(Number); return m === 12 ? ymd(y + 1, 1, d) : ymd(y, m + 1, d); };
const monthsBetween = (fromY, fromM, toY, toM) => {
  const out = []; let y = fromY, m = fromM;
  while (y < toY || (y === toY && m <= toM)) { out.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  return out;
};
const lit = (v) => v === null || v === undefined ? 'null'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? String(v)
  : Array.isArray(v) ? `array[${v.map(lit).join(',')}]::text[]`
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  : `'${String(v).replace(/'/g, "''")}'`;
const insert = (table, rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) {
    chunks.push(`insert into accounts.${table} (${cols.join(', ')}) values\n` +
      rows.slice(i, i + 200).map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n') + ';');
  }
  return chunks.join('\n');
};

// USD → CAD, roughly tracking the real 2024–2026 path.
const USD = { '2024-10': 1.375, '2024-11': 1.398, '2024-12': 1.427, '2025-01': 1.441, '2025-02': 1.428, '2025-03': 1.432,
  '2025-04': 1.392, '2025-05': 1.383, '2025-06': 1.366, '2025-07': 1.371, '2025-08': 1.381, '2025-09': 1.386, '2025-10': 1.401,
  '2025-11': 1.406, '2025-12': 1.389, '2026-01': 1.392, '2026-02': 1.398, '2026-03': 1.405, '2026-04': 1.401, '2026-05': 1.396,
  '2026-06': 1.402, '2026-07': 1.409, '2026-08': 1.415, '2026-09': 1.419, '2026-10': 1.4243 };
const fx = (currency, iso) => currency === 'USD' ? USD[iso.slice(0, 7)] ?? 1.4 : 1;

export async function generate({ q }) {
  const cats = Object.fromEntries((await q(`select id, name from accounts.categories`)).map((r) => [r.name, r.id]));
  const taxes = Object.fromEntries((await q(`select id, code, rate from accounts.tax_rates`)).map((r) => [r.code, r]));
  const sql = [];
  const files = [];

  // ───────────── people & accounts ─────────────
  const DS = uuid('member:deeparsh'), GS = uuid('member:gursahib');
  const members = [
    { id: DS, full_name: 'Deeparsh Singh', email: 'deeparshsingh10@gmail.com', role: 'owner', ownership_pct: 50, color: '#03DDAA', initials: 'DS' },
    { id: GS, full_name: 'Gursahib Singh', email: 'gursahib99888@gmail.com', role: 'owner', ownership_pct: 50, color: '#0680A2', initials: 'GS' },
  ];
  const ACC = {
    eq: uuid('acct:eq-cad'), eqUsd: uuid('acct:eq-usd'), card: uuid('acct:card'),
    dsPersonal: uuid('acct:ds-personal'), gsPersonal: uuid('acct:gs-personal'),
  };
  const accounts = [
    { id: ACC.eq, name: 'EQ Bank Business', kind: 'bank', institution: 'EQ Bank', currency: 'CAD', last4: '2081', owner_member_id: null, opening_balance: 0, is_business: true, color: '#0680A2' },
    { id: ACC.eqUsd, name: 'EQ Bank Business USD', kind: 'bank', institution: 'EQ Bank', currency: 'USD', last4: '7730', owner_member_id: null, opening_balance: 0, is_business: true, color: '#05A38C' },
    { id: ACC.card, name: 'Business Card', kind: 'credit_card', institution: 'Business Visa', currency: 'CAD', last4: '4417', owner_member_id: null, opening_balance: 0, is_business: true, color: '#03DDAA' },
    { id: ACC.dsPersonal, name: 'Deeparsh — personal', kind: 'personal', institution: null, currency: 'CAD', last4: null, owner_member_id: DS, opening_balance: 0, is_business: false, color: '#9BB1B5' },
    { id: ACC.gsPersonal, name: 'Gursahib — personal', kind: 'personal', institution: null, currency: 'CAD', last4: null, owner_member_id: GS, opening_balance: 0, is_business: false, color: '#9BB1B5' },
  ];
  const personalOf = { [DS]: ACC.dsPersonal, [GS]: ACC.gsPersonal };

  sql.push(`
    -- wipe previous sample run (settings, categories and tax rates stay)
    truncate accounts.payment_allocations, accounts.payments, accounts.invoice_revisions, accounts.invoice_lines,
      accounts.invoices, accounts.recurring_invoices, accounts.bank_transactions, accounts.import_batches, accounts.expenses,
      accounts.recurring_expenses, accounts.member_transfers, accounts.mileage_trips, accounts.attachments, accounts.documents,
      accounts.tax_filings, accounts.rules, accounts.other_income, accounts.items, accounts.projects, accounts.clients, accounts.activity_log, accounts.fx_rates cascade;
    update accounts.business_profile set
      legal_name = 'Tech Nerv Solutions Inc.', operating_name = 'Tech Nerv',
      business_number = '700000000', gst_number = '700000000 RT0001', bc_incorporation_number = 'BC1400000',
      address_line1 = '200 – 275 Lansdowne Street', city = 'Kamloops', province = 'BC', postal_code = 'V2C 1X8',
      email = 'accounts@technerv.com', phone = '(250) 555-0142', website = 'technerv.com',
      fiscal_year_end = '09-30', gst_filing_period = 'annual', incorporated_on = '2024-08-15', gst_registered_on = '2024-09-03',
      etransfer_email = 'accounts@technerv.com',
      bank_details = 'EQ Bank · Transit 30000 · Institution 623 · Account ••••2081',
      payment_instructions = 'Pay by Interac e-Transfer to accounts@technerv.com (auto-deposit) or EFT to the account below. Please include the invoice number.',
      invoice_footer = 'Tech Nerv Solutions Inc. · Kamloops, British Columbia · technerv.com';
    insert into accounts.members (id, full_name, email, role, ownership_pct, color, initials) values
      ${members.map((m) => `(${[m.id, m.full_name, m.email, m.role, m.ownership_pct, m.color, m.initials].map(lit).join(', ')})`).join(',\n      ')}
      on conflict (email) do update set full_name = excluded.full_name, ownership_pct = excluded.ownership_pct, color = excluded.color, initials = excluded.initials;
  `);
  // Use whatever ids the members already have (auth may have linked them).
  sql.push(`
    delete from accounts.money_accounts where id not in (${Object.values(ACC).map(lit).join(', ')});
    ${accounts.map((a) => `insert into accounts.money_accounts (${Object.keys(a).join(', ')}) values (${Object.values(a).map(lit).join(', ')})
      on conflict (id) do update set name = excluded.name, kind = excluded.kind, institution = excluded.institution, currency = excluded.currency,
      last4 = excluded.last4, owner_member_id = excluded.owner_member_id, is_business = excluded.is_business, color = excluded.color;`).join('\n')}
  `);

  // FX table (first of each month)
  sql.push(insert('fx_rates', Object.entries(USD).map(([m, r]) => ({ currency: 'USD', rate_date: `${m}-01`, rate_to_cad: r, source: 'bank_of_canada' }))));

  // ───────────── clients, projects, items ─────────────
  const C = (key, o) => ({ id: uuid('client:' + key), key, ...o });
  const clients = [
    C('riverbend', { display_name: 'Riverbend Family Clinic', company_name: 'Riverbend Family Clinic Ltd.', contact_name: 'Dr. Amrit Sandhu', email: 'admin@riverbendclinic.example', phone: '(250) 555-0187', address_line1: '1450 Summit Drive', city: 'Kamloops', province: 'BC', postal_code: 'V2C 1T8', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 15 }),
    C('summit', { display_name: 'Summit Field Services', company_name: 'Summit Field Services Inc.', contact_name: 'Kara Whitfield', email: 'ap@summitfield.example', phone: '(250) 555-0119', address_line1: '780 Mission Flats Road', city: 'Kamloops', province: 'BC', postal_code: 'V2C 1A4', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 30 }),
    C('northshore', { display_name: 'Northshore Developments', company_name: 'Northshore Developments Ltd.', contact_name: 'Marcus Lee', email: 'marcus@northshoredev.example', phone: '(604) 555-0163', address_line1: '1100 Esplanade Avenue, Suite 400', city: 'North Vancouver', province: 'BC', postal_code: 'V7L 1A1', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 15 }),
    C('maple', { display_name: 'Maple & Main Dental', company_name: 'Maple & Main Dental Professional Corp.', contact_name: 'Priya Raman', email: 'office@maplemaindental.example', phone: '(416) 555-0128', address_line1: '88 Queen Street East', city: 'Toronto', province: 'ON', postal_code: 'M5C 1S6', country: 'CA', currency: 'CAD', tax: 'HST-ON', terms_days: 15 }),
    C('okanagan', { display_name: 'Okanagan Legal LLP', company_name: 'Okanagan Legal LLP', contact_name: 'Jordan Becker', email: 'accounts@okanaganlegal.example', phone: '(250) 555-0175', address_line1: '1630 Pandosy Street', city: 'Kelowna', province: 'BC', postal_code: 'V1Y 1P7', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 30 }),
    C('prairie', { display_name: 'Prairie Peak Physio', company_name: 'Prairie Peak Physiotherapy Inc.', contact_name: 'Hannah Okafor', email: 'hannah@prairiepeak.example', phone: '(403) 555-0191', address_line1: '505 17 Avenue SW', city: 'Calgary', province: 'AB', postal_code: 'T2S 0A9', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 15 }),
    C('harbourview', { display_name: 'Harbourview Property Mgmt', company_name: 'Harbourview Property Management Ltd.', contact_name: 'Colin MacDonald', email: 'payables@harbourview.example', phone: '(902) 555-0148', address_line1: '1801 Hollis Street', city: 'Halifax', province: 'NS', postal_code: 'B3J 3N4', country: 'CA', currency: 'CAD', tax: 'HST-NS', terms_days: 30 }),
    C('cascadia', { display_name: 'Cascadia Wellness Co.', company_name: 'Cascadia Wellness Company LLC', contact_name: 'Rachel Kim', email: 'billing@cascadiawellness.example', phone: '+1 (206) 555-0134', address_line1: '1201 Western Avenue', city: 'Seattle', province: 'WA', postal_code: '98101', country: 'US', currency: 'USD', tax: 'ZERO', terms_days: 30 }),
    C('thompson', { display_name: 'Thompson Valley Roofing', company_name: 'Thompson Valley Roofing Ltd.', contact_name: 'Dale Fournier', email: 'dale@tvroofing.example', phone: '(250) 555-0102', address_line1: '935 Laval Crescent', city: 'Kamloops', province: 'BC', postal_code: 'V2C 5P4', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 15 }),
    C('lakeside', { display_name: 'Lakeside Auto Group', company_name: 'Lakeside Auto Group Inc.', contact_name: 'Sofia Martins', email: 'sofia@lakesideauto.example', phone: '(250) 555-0156', address_line1: '4800 27 Street', city: 'Vernon', province: 'BC', postal_code: 'V1T 4Z2', country: 'CA', currency: 'CAD', tax: 'GST', terms_days: 15 }),
  ];
  const CL = Object.fromEntries(clients.map((c) => [c.key, c]));
  sql.push(insert('clients', clients.map(({ key, tax, ...c }) => ({ ...c, default_tax_rate_id: taxes[tax].id, notes: null, created_at: '2024-10-01T16:00:00Z' }))));

  const P = (key, client, name, status, started_on, budget) => ({ id: uuid('project:' + key), key, client_id: CL[client].id, name, status, started_on, budget });
  const projects = [
    P('riverbend-voice', 'riverbend', 'Voice AI Receptionist', 'done', '2024-11-04', 12000),
    P('summit-rag', 'summit', 'Field Knowledge Engine (RAG)', 'done', '2025-03-03', 16500),
    P('northshore-chat', 'northshore', 'Lead Intelligence Chatbot', 'done', '2025-06-02', 9800),
    P('maple-voice', 'maple', 'Bilingual Voice Receptionist', 'done', '2025-09-08', 11500),
    P('okanagan-rag', 'okanagan', 'Precedent Search Assistant', 'active', '2026-01-12', 14000),
    P('prairie-chat', 'prairie', 'Booking Chatbot', 'done', '2026-04-06', 7200),
    P('harbourview-voice', 'harbourview', 'After-hours Voice Line', 'active', '2026-07-06', 13800),
    P('cascadia-chat', 'cascadia', 'Member Concierge Chatbot', 'active', '2026-08-10', 8500),
    P('thompson-discovery', 'thompson', 'Automation Discovery', 'lead', '2025-02-10', 750),
    P('internal', 'riverbend', 'Ongoing support', 'active', '2025-01-01', null),
  ];
  const PR = Object.fromEntries(projects.map((p) => [p.key, p]));
  sql.push(insert('projects', projects.filter((p) => p.key !== 'internal').map(({ key, ...p }) => ({ ...p, notes: null }))));

  const items = [
    { id: uuid('item:discovery'), name: 'Discovery & scoping', description: 'Workflow mapping, requirements and fixed-price proposal', unit: 'fixed', unit_price: 750, cat: 'Project revenue' },
    { id: uuid('item:voice'), name: 'Voice AI Receptionist — build', description: 'Design, build, telephony integration and launch', unit: 'fixed', unit_price: 12000, cat: 'Project revenue' },
    { id: uuid('item:chat'), name: 'Lead Intelligence Chatbot — build', description: 'Qualification flows, CRM hand-off and analytics', unit: 'fixed', unit_price: 9000, cat: 'Project revenue' },
    { id: uuid('item:rag'), name: 'RAG Knowledge Engine — build', description: 'Document ingestion, retrieval tuning and cited answers', unit: 'fixed', unit_price: 15000, cat: 'Project revenue' },
    { id: uuid('item:support'), name: 'Support & optimization retainer', description: 'Monitoring, prompt tuning, monthly report', unit: 'month', unit_price: 850, cat: 'Support & retainers' },
    { id: uuid('item:hourly'), name: 'Consulting', description: 'Additional development or consulting', unit: 'hour', unit_price: 150, cat: 'Project revenue' },
    { id: uuid('item:training'), name: 'Team training session', description: 'Two-hour hands-on session for staff', unit: 'session', unit_price: 400, cat: 'Project revenue' },
    { id: uuid('item:usage'), name: 'Telephony & AI usage (pass-through)', description: 'Twilio minutes and model usage at cost', unit: 'month', unit_price: 0, cat: 'Other income' },
  ];
  sql.push(insert('items', items.map(({ cat, ...i }) => ({ ...i, tax_rate_id: taxes.GST.id, category_id: cats[cat] }))));

  // ───────────── invoices & estimates ─────────────
  const invoices = [], lines = [], payments = [], allocs = [], revisions = [], bankRows = [];
  let invSeq = 1001, estSeq = 1001;
  const memberFor = (k) => ['riverbend', 'summit', 'okanagan', 'thompson', 'lakeside'].includes(k) ? DS : GS;
  const METHOD = { summit: 'eft', harbourview: 'eft', okanagan: 'cheque', cascadia: 'wire' };

  function addDoc({ kind = 'invoice', client, project, issue, lines: ls, status, paid = [], title, notes, po, revisedFrom, discount = 0 }) {
    const c = CL[client];
    const tax = taxes[c.tax];
    const id = uuid(`${kind}:${client}:${issue}:${title ?? ls[0].description}`);
    const number = kind === 'estimate' ? `EST-${estSeq++}` : kind === 'credit_note' ? `CN-${invSeq++}` : `TN-${invSeq++}`;
    const due = kind === 'estimate' ? addDays(issue, 30) : addDays(issue, c.terms_days);
    let subtotal = 0, taxTotal = 0;
    ls.forEach((l, i) => {
      const amount = money(l.quantity * l.unit_price);
      subtotal += amount; taxTotal += money(amount * Number(tax.rate));
      lines.push({ id: uuid(`line:${id}:${i}`), invoice_id: id, sort: i, item_id: l.item ? uuid('item:' + l.item) : null, description: l.description, quantity: l.quantity, unit_price: l.unit_price, unit: l.unit ?? null, tax_rate_id: tax.id });
    });
    const total = money(subtotal - discount + taxTotal);
    const sentAt = status === 'draft' ? null : `${issue}T${String(int(15, 23)).padStart(2, '0')}:${String(int(10, 59))}:00Z`;
    invoices.push({
      id, kind, number, client_id: c.id, project_id: project ? PR[project].id : null, status: status === 'paid' || status === 'partial' ? 'sent' : status,
      issue_date: issue, due_date: due, currency: c.currency, fx_rate: fx(c.currency, issue), discount, title: title ?? null,
      po_number: po ?? null, notes: notes ?? null, terms: null, sent_at: sentAt, viewed_at: sentAt ? addDays(issue, 1) + 'T17:20:00Z' : null,
      created_by: memberFor(client), created_at: `${addDays(issue, -1)}T21:${String(int(10, 59))}:00Z`, converted_from: revisedFrom ?? null, revision: 1,
    });
    // payments
    for (const [i, p] of paid.entries()) {
      const amt = p.amount === 'rest' ? money(total - paid.slice(0, i).reduce((s, x) => s + x.amount, 0)) : p.amount === 'all' ? total : p.amount;
      const pid = uuid(`payment:${id}:${i}`);
      const method = METHOD[client] ?? 'etransfer';
      const account = c.currency === 'USD' ? ACC.eqUsd : ACC.eq;
      payments.push({ id: pid, client_id: c.id, received_on: p.on, amount: amt, currency: c.currency, fx_rate: fx(c.currency, p.on), method,
        deposit_account_id: account, reference: method === 'cheque' ? `Cheque #${int(1200, 4800)}` : method === 'etransfer' ? `CA${int(100000, 999999)}${'XYZW'[int(0, 3)]}` : `${method.toUpperCase()}-${int(10000, 99999)}`,
        notes: null, recorded_by: memberFor(client), created_at: `${p.on}T18:05:00Z` });
      allocs.push({ id: uuid(`alloc:${pid}`), payment_id: pid, invoice_id: id, amount: amt });
      bankRows.push({ account, on: p.on, amount: amt,
        description: method === 'etransfer' ? `INTERAC E-TRANSFER DEPOSIT ${c.company_name.toUpperCase().slice(0, 22)}` : method === 'cheque' ? `MOBILE CHEQUE DEPOSIT` : method === 'wire' ? `INCOMING WIRE ${c.company_name.toUpperCase().slice(0, 20)}` : `EFT CREDIT ${c.company_name.toUpperCase().slice(0, 22)}`,
        match: { payment: pid } });
    }
    return { id, number, total };
  }
  const L = (item, description, quantity, unit_price, unit) => ({ item, description, quantity, unit_price, unit });
  const pay = (on, amount = 'all') => ({ on, amount });

  // Thompson — discovery, then a new estimate this month
  addDoc({ kind: 'invoice', client: 'thompson', project: 'thompson-discovery', issue: '2025-02-14', status: 'paid', title: 'Automation discovery',
    lines: [L('discovery', 'Discovery & scoping — dispatch and quoting workflow', 1, 750, 'fixed')], paid: [pay('2025-02-24')] });

  // Builds: estimate (accepted) → deposit → final
  function build({ client, project, estimateOn, depositOn, finalOn, price, item, label, depositPaid, finalPaid, finalStatus = 'paid', extras = [] }) {
    const est = addDoc({ kind: 'estimate', client, project, issue: estimateOn, status: 'accepted', title: label,
      lines: [L(item, `${label} — fixed price build`, 1, price, 'fixed'), ...extras] });
    const half = money(price / 2);
    addDoc({ client, project, issue: depositOn, status: 'paid', title: `${label} — 50% deposit`, revisedFrom: est.id,
      lines: [L(item, `${label} — 50% deposit on acceptance`, 1, half, 'fixed')], paid: depositPaid });
    return addDoc({ client, project, issue: finalOn, status: finalStatus, title: `${label} — completion`,
      lines: [L(item, `${label} — balance on launch`, 1, price - half, 'fixed'), ...extras], paid: finalPaid });
  }
  build({ client: 'riverbend', project: 'riverbend-voice', estimateOn: '2024-10-21', depositOn: '2024-11-04', finalOn: '2024-12-16', price: 12000, item: 'voice', label: 'Voice AI Receptionist',
    depositPaid: [pay('2024-11-08')], finalPaid: [pay('2024-12-27')], extras: [L('training', 'Front-desk team training', 1, 400, 'session')] });
  build({ client: 'summit', project: 'summit-rag', estimateOn: '2025-02-18', depositOn: '2025-03-03', finalOn: '2025-04-21', price: 16500, item: 'rag', label: 'Field Knowledge Engine',
    depositPaid: [pay('2025-03-26')], finalPaid: [pay('2025-05-16')] });
  const ns = build({ client: 'northshore', project: 'northshore-chat', estimateOn: '2025-05-20', depositOn: '2025-06-02', finalOn: '2025-07-14', price: 9800, item: 'chat', label: 'Lead Intelligence Chatbot',
    depositPaid: [pay('2025-06-05')], finalPaid: [pay('2025-07-18', 5000), pay('2025-08-01', 'rest')], extras: [L('hourly', 'Extra CRM field mapping (scope change)', 6, 150, 'hour')] });
  build({ client: 'maple', project: 'maple-voice', estimateOn: '2025-08-25', depositOn: '2025-09-08', finalOn: '2025-10-20', price: 11500, item: 'voice', label: 'Bilingual Voice Receptionist',
    depositPaid: [pay('2025-09-12')], finalPaid: [pay('2025-11-03')] });
  build({ client: 'okanagan', project: 'okanagan-rag', estimateOn: '2025-12-15', depositOn: '2026-01-12', finalOn: '2026-03-02', price: 14000, item: 'rag', label: 'Precedent Search Assistant',
    depositPaid: [pay('2026-01-29')], finalPaid: [pay('2026-03-27')] });
  build({ client: 'prairie', project: 'prairie-chat', estimateOn: '2026-03-23', depositOn: '2026-04-06', finalOn: '2026-05-18', price: 7200, item: 'chat', label: 'Booking Chatbot',
    depositPaid: [pay('2026-04-09')], finalPaid: [pay('2026-06-02', 2000)], finalStatus: 'partial' });
  build({ client: 'harbourview', project: 'harbourview-voice', estimateOn: '2026-06-22', depositOn: '2026-07-06', finalOn: '2026-09-21', price: 13800, item: 'voice', label: 'After-hours Voice Line',
    depositPaid: [pay('2026-07-31')], finalPaid: [], finalStatus: 'sent' });
  build({ client: 'cascadia', project: 'cascadia-chat', estimateOn: '2026-07-27', depositOn: '2026-08-10', finalOn: '2026-10-01', price: 8500, item: 'chat', label: 'Member Concierge Chatbot',
    depositPaid: [pay('2026-08-24')], finalPaid: [], finalStatus: 'draft' });

  // Northshore final invoice was regenerated once after a scope change.
  revisions.push({ invoice_id: ns.id, revision: 1, reason: 'Original issue', createdOn: '2025-07-14' });
  revisions.push({ invoice_id: ns.id, revision: 2, reason: 'Added CRM field mapping hours (scope change approved by Marcus)', createdOn: '2025-07-15' });

  // Monthly retainers, issued on the 1st
  const retainers = [
    { client: 'riverbend', from: [2025, 1], amount: 850, lateness: [3, 12] },
    { client: 'summit', from: [2025, 5], amount: 1200, lateness: [18, 29] },
    { client: 'northshore', from: [2025, 8], amount: 650, lateness: [2, 9] },
    { client: 'maple', from: [2025, 11], amount: 750, lateness: [5, 14], unpaidFrom: '2026-08' },
  ];
  for (const r of retainers) {
    for (const [y, m] of monthsBetween(r.from[0], r.from[1], 2026, 10)) {
      const issue = ymd(y, m, 1);
      const monthName = new Date(issue + 'T12:00:00Z').toLocaleString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const isCurrent = issue === '2026-10-01';
      const unpaid = isCurrent || (r.unpaidFrom && issue >= r.unpaidFrom + '-01');
      const paidOn = addDays(issue, int(...r.lateness));
      const ls = [L('support', `Support & optimization retainer — ${monthName}`, 1, r.amount, 'month')];
      if (r.client === 'riverbend' || r.client === 'maple') ls.push(L('usage', `Telephony & AI usage — ${monthName}`, 1, money(between(38, 96)), 'month'));
      addDoc({ client: r.client, project: null, issue, status: unpaid ? 'sent' : 'paid', title: `Retainer — ${monthName}`, lines: ls,
        paid: unpaid || paidOn > TODAY ? [] : [pay(paidOn)] });
    }
  }

  // Hourly work for Okanagan after launch
  for (const [issue, hours, paidOn] of [['2026-05-01', 8, '2026-05-28'], ['2026-07-02', 5.5, '2026-07-30'], ['2026-09-01', 12, null]]) {
    addDoc({ client: 'okanagan', project: 'okanagan-rag', issue, status: paidOn ? 'paid' : 'sent', title: 'Additional development',
      lines: [L('hourly', 'Additional development — matter intake connector', hours, 150, 'hour')], paid: paidOn ? [pay(paidOn)] : [] });
  }
  addDoc({ client: 'summit', project: 'summit-rag', issue: '2025-11-17', status: 'paid', title: 'Field crew training',
    lines: [L('training', 'On-site training — Kamloops yard', 2, 400, 'session'), L('hourly', 'Prep and follow-up', 3, 150, 'hour')], paid: [pay('2025-12-12')] });

  // Estimates in flight, a declined one, a void duplicate and a goodwill credit note
  addDoc({ kind: 'estimate', client: 'thompson', issue: '2026-09-24', status: 'sent', title: 'Quote-request chatbot',
    lines: [L('chat', 'Quote-request chatbot with photo upload', 1, 6800, 'fixed'), L('support', 'Support retainer (optional, monthly)', 1, 450, 'month')], notes: 'Valid for 30 days. Retainer is optional and month-to-month.' });
  addDoc({ kind: 'estimate', client: 'lakeside', issue: '2026-05-11', status: 'declined', title: 'Service-desk voice agent',
    lines: [L('voice', 'Service-desk voice agent for three locations', 1, 18500, 'fixed')] });
  addDoc({ kind: 'estimate', client: 'lakeside', issue: '2026-09-29', status: 'draft', title: 'Lead follow-up pilot',
    lines: [L('chat', 'Single-location lead follow-up pilot', 1, 4500, 'fixed'), L('discovery', 'Discovery workshop', 1, 750, 'fixed')] });
  addDoc({ client: 'riverbend', issue: '2025-03-01', status: 'void', title: 'Retainer — March 2025 (duplicate)', notes: 'Voided — issued twice by mistake.',
    lines: [L('support', 'Support & optimization retainer — March 2025', 1, 850, 'month')] });
  addDoc({ kind: 'credit_note', client: 'riverbend', issue: '2025-06-03', status: 'paid', title: 'Goodwill credit',
    lines: [L('support', 'Credit for 2-day phone outage (carrier side)', 1, 200, 'fixed')], notes: 'Applied to the June retainer.' });
  addDoc({ client: 'okanagan', issue: '2026-10-01', status: 'draft', title: 'Additional development — October',
    lines: [L('hourly', 'Calendar sync for intake connector', 4, 150, 'hour')] });

  // Number documents chronologically, the way they'd have been issued.
  invSeq = 1001; estSeq = 1001;
  for (const i of [...invoices].sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.created_at.localeCompare(b.created_at))) {
    i.number = i.kind === 'estimate' ? `EST-${estSeq++}` : i.kind === 'credit_note' ? `CN-${invSeq++}` : `TN-${invSeq++}`;
  }
  sql.push(insert('invoices', invoices));
  sql.push(insert('invoice_lines', lines));
  sql.push(insert('payments', payments));
  sql.push(insert('payment_allocations', allocs));
  // Restore intended statuses that the allocation trigger can't infer
  sql.push(`update accounts.invoices set status = 'accepted' where kind = 'estimate' and id in (${invoices.filter((i) => i.kind === 'estimate' && i.status === 'accepted').map((i) => lit(i.id)).join(',')});`);
  sql.push(`update accounts.invoices set status = 'paid', amount_paid = total where kind = 'credit_note';`);
  sql.push(`update accounts.business_profile set next_invoice_seq = ${invSeq}, next_estimate_seq = ${estSeq};`);
  sql.push(`update accounts.invoices set revision = 2 where id = ${lit(ns.id)};`);
  for (const r of revisions) {
    sql.push(`insert into accounts.invoice_revisions (invoice_id, revision, reason, created_at, created_by, snapshot)
      select i.id, ${r.revision}, ${lit(r.reason)}, ${lit(r.createdOn + 'T19:00:00Z')}, i.created_by,
        jsonb_build_object('invoice', to_jsonb(i), 'lines', (select jsonb_agg(to_jsonb(l) order by l.sort) from accounts.invoice_lines l
          where l.invoice_id = i.id ${r.revision === 1 ? `and l.description not like 'Extra CRM%'` : ''}), 'client', (select to_jsonb(c) from accounts.clients c where c.id = i.client_id))
      from accounts.invoices i where i.id = ${lit(r.invoice_id)};`);
  }

  sql.push(insert('recurring_invoices', retainers.map((r) => ({
    id: uuid('recurring:' + r.client), client_id: CL[r.client].id, project_id: null, template_invoice_id: null,
    frequency: 'monthly', next_run_on: '2026-11-01', end_on: null, auto_send: false, active: r.client !== 'maple',
  }))));

  // ───────────── expenses ─────────────
  const expenses = [], expFiles = [];
  const TAX = { bcGoods: { gst: 0.05, pst: 0.07 }, gstOnly: { gst: 0.05, pst: 0 }, none: { gst: 0, pst: 0 }, phone: { gst: 0.05, pst: 0.07 } };
  function exp({ on, vendor, description, cat, by, from, total, currency = 'CAD', tax = 'gstOnly', nature = 'business', pct = 100, project, receipt = true, source = 'manual', recurring, tags = [], notes, billable = false }) {
    const t = TAX[tax];
    const subtotal = money(total / (1 + t.gst + t.pst));
    const gst = money(subtotal * t.gst), pst = money(subtotal * t.pst);
    const id = uuid(`expense:${on}:${vendor}:${total}:${expenses.length}`);
    const row = { id, spent_on: on, vendor, description: description ?? null, category_id: cats[cat], project_id: project ? PR[project].id : null,
      spent_by: by, paid_from_account_id: from, nature, business_pct: nature === 'personal' ? 0 : pct, currency, subtotal, gst_hst: gst, pst,
      total, fx_rate: fx(currency, on), billable, settled: false, tags, notes: notes ?? null, source, recurring_expense_id: recurring ?? null,
      created_by: by, created_at: `${on}T${String(int(16, 23))}:${String(int(10, 59))}:00Z` };
    expenses.push(row);
    if (receipt && on <= TODAY) expFiles.push(row);
    return row;
  }

  // Subscriptions
  const subs = [
    { key: 'openai', vendor: 'OpenAI', description: 'API usage', cat: 'Cloud, hosting & APIs', by: DS, from: ACC.card, currency: 'USD', amount: () => money(between(48, 210)), tax: 'gstOnly', start: [2024, 10], day: 3, desc: 'OPENAI *API' },
    { key: 'anthropic', vendor: 'Anthropic', description: 'Claude Team', cat: 'Software & subscriptions', by: GS, from: ACC.card, currency: 'USD', amount: () => 60, tax: 'gstOnly', start: [2025, 2], day: 8, desc: 'ANTHROPIC' },
    { key: 'twilio', vendor: 'Twilio', description: 'Voice minutes & numbers', cat: 'Cloud, hosting & APIs', by: GS, from: ACC.card, currency: 'USD', amount: () => money(between(22, 140)), tax: 'none', start: [2024, 11], day: 1, desc: 'TWILIO SENDGRID' },
    { key: 'gws', vendor: 'Google Workspace', description: '2 seats', cat: 'Software & subscriptions', by: DS, from: ACC.card, currency: 'CAD', amount: () => 39.9, tax: 'gstOnly', start: [2024, 10], day: 1, desc: 'GOOGLE*WORKSPACE TECHNE' },
    { key: 'azure', vendor: 'Microsoft Azure', description: 'Hosting', cat: 'Cloud, hosting & APIs', by: GS, from: ACC.card, currency: 'CAD', amount: () => money(between(18, 95)), tax: 'gstOnly', start: [2025, 1], day: 5, desc: 'MICROSOFT*AZURE' },
    { key: 'vercel', vendor: 'Vercel', description: 'Pro plan', cat: 'Cloud, hosting & APIs', by: DS, from: ACC.card, currency: 'USD', amount: () => 20, tax: 'none', start: [2025, 3], day: 12, desc: 'VERCEL INC.' },
    { key: 'figma', vendor: 'Figma', description: 'Professional', cat: 'Software & subscriptions', by: DS, from: ACC.card, currency: 'USD', amount: () => 16, tax: 'none', start: [2024, 10], day: 17, desc: 'FIGMA MONTHLY' },
    { key: 'github', vendor: 'GitHub', description: 'Team plan', cat: 'Software & subscriptions', by: GS, from: ACC.card, currency: 'USD', amount: () => 8, tax: 'none', start: [2024, 10], day: 22, desc: 'GITHUB, INC.' },
    { key: 'telus', vendor: 'Telus', description: 'Home internet (40% business)', cat: 'Internet & phone', by: DS, from: ACC.eq, currency: 'CAD', amount: () => 95.2, tax: 'phone', nature: 'mixed', pct: 40, start: [2024, 10], day: 14, desc: 'TELUS COMMUNICATIONS PAP' },
    { key: 'ds-phone', vendor: 'Rogers', description: 'Mobile plan (60% business)', cat: 'Internet & phone', by: DS, from: ACC.dsPersonal, currency: 'CAD', amount: () => 72.8, tax: 'phone', nature: 'mixed', pct: 60, start: [2024, 10], day: 9 },
    { key: 'gs-phone', vendor: 'Freedom Mobile', description: 'Mobile plan (60% business)', cat: 'Internet & phone', by: GS, from: ACC.gsPersonal, currency: 'CAD', amount: () => 55.99, tax: 'phone', nature: 'mixed', pct: 60, start: [2024, 10], day: 11 },
  ];
  const recurringRows = [];
  for (const s of subs) {
    const rid = uuid('recurring-exp:' + s.key);
    let last;
    for (const [y, m] of monthsBetween(s.start[0], s.start[1], 2026, 10)) {
      const on = ymd(y, m, s.day);
      if (on > TODAY) break;
      last = exp({ on, vendor: s.vendor, description: s.description, cat: s.cat, by: s.by, from: s.from, total: s.amount(), currency: s.currency,
        tax: s.tax, nature: s.nature ?? 'business', pct: s.pct ?? 100, receipt: on >= '2026-06-01' || rand() < 0.55, recurring: rid, source: 'recurring', tags: ['subscription'] });
      last.bankDesc = s.desc;
    }
    recurringRows.push({ id: rid, vendor: s.vendor, description: s.description, category_id: cats[s.cat], spent_by: s.by, paid_from_account_id: s.from,
      nature: s.nature ?? 'business', business_pct: s.pct ?? 100, currency: s.currency, amount: last.total, gst_hst: last.gst_hst, frequency: 'monthly',
      next_on: nextMonth(last.spent_on), active: true });
  }
  // Yearly items
  for (const y of [2024, 2025]) {
    exp({ on: `${y + 1}-01-15`, vendor: 'Cascade Business Insurance', description: 'Professional liability + cyber policy', cat: 'Insurance', by: GS, from: ACC.eq, total: 1188, tax: 'none' }).bankDesc = 'CASCADE INS PREMIUM';
    exp({ on: `${y}-11-02`, vendor: 'Namecheap', description: 'technerv.com renewal + email forwarding', cat: 'Software & subscriptions', by: DS, from: ACC.dsPersonal, total: 31.4, currency: 'USD', tax: 'none' });
  }
  exp({ on: '2024-09-20', vendor: 'BC Registry Services', description: 'Incorporation & name reservation', cat: 'Licences, dues & memberships', by: DS, from: ACC.dsPersonal, total: 381.5, tax: 'none' });
  exp({ on: '2024-10-04', vendor: 'Apple Store', description: 'MacBook Pro 14" (M4 Pro) — dev machine', cat: 'Computer equipment (capital)', by: GS, from: ACC.card, total: 3247.2, tax: 'bcGoods', tags: ['asset'] }).bankDesc = 'APPLE STORE #R411';
  exp({ on: '2025-04-12', vendor: 'Best Buy', description: '27" 4K monitor ×2', cat: 'Computer equipment (capital)', by: DS, from: ACC.card, total: 951.97, tax: 'bcGoods', tags: ['asset'] }).bankDesc = 'BEST BUY #962 KAMLOOPS';
  exp({ on: '2025-08-19', vendor: 'IKEA', description: 'Standing desk', cat: 'Furniture & equipment (capital)', by: GS, from: ACC.gsPersonal, total: 615.99, tax: 'bcGoods', tags: ['asset'] });
  exp({ on: '2026-02-03', vendor: 'Apple Store', description: 'iPhone 16 test device', cat: 'Computer equipment (capital)', by: DS, from: ACC.card, total: 1231.99, tax: 'bcGoods', tags: ['asset'] }).bankDesc = 'APPLE STORE #R411';
  exp({ on: '2025-12-09', vendor: 'Northline CPA', description: 'FY2025 T2 & GST return preparation', cat: 'Professional fees (legal/accounting)', by: GS, from: ACC.eq, total: 1890, tax: 'gstOnly' }).bankDesc = 'NORTHLINE CPA BILL PAY';
  exp({ on: '2024-10-28', vendor: 'Fulton & Crane LLP', description: 'Shareholder agreement', cat: 'Professional fees (legal/accounting)', by: DS, from: ACC.card, total: 1260, tax: 'gstOnly' }).bankDesc = 'FULTON CRANE LLP';
  exp({ on: '2026-04-14', vendor: 'Freelance — Maya Chen', description: 'Brand illustrations for case studies', cat: 'Subcontractors', by: DS, from: ACC.eq, total: 840, tax: 'none', notes: 'Not GST registered (small supplier).' }).bankDesc = 'E-TRANSFER SENT MAYA CHEN';
  exp({ on: '2026-08-11', vendor: 'Freelance — Ethan Brooks', description: 'Voice persona recording session', cat: 'Subcontractors', by: GS, from: ACC.eq, total: 600, tax: 'none', project: 'harbourview-voice', billable: true }).bankDesc = 'E-TRANSFER SENT ETHAN BROOKS';

  // Marketing, travel, meals, office — spread over time
  const restaurants = ['The Noble Pig', 'Red Beard Café', 'Hello Toast', 'Earls Kitchen + Bar', 'Frick & Frack Taphouse', 'Brownstone Restaurant', 'Cordo Resto + Bar'];
  const clientsForMeals = ['riverbend', 'summit', 'thompson', 'okanagan', 'lakeside'];
  for (const [y, m] of monthsBetween(2024, 10, 2026, 9)) {
    // client meals
    for (let i = 0; i < int(1, 3); i++) {
      const by = rand() < 0.5 ? DS : GS;
      const from = rand() < 0.75 ? ACC.card : personalOf[by];
      const e = exp({ on: ymd(y, m, int(2, 27)), vendor: pick(restaurants), description: `Lunch meeting — ${CL[pick(clientsForMeals)].display_name}`, cat: 'Meals & entertainment', by, from, total: money(between(34, 128)), tax: 'gstOnly', receipt: rand() < 0.85 });
      e.bankDesc = e.vendor.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 20) + ' KAMLOOPS';
    }
    // ads
    if (rand() < 0.6) exp({ on: ymd(y, m, int(1, 26)), vendor: pick(['Google Ads', 'LinkedIn Ads']), description: 'Campaign — SMB automation', cat: 'Advertising & marketing', by: GS, from: ACC.card, total: money(between(60, 260)), tax: 'gstOnly' }).bankDesc = 'GOOGLE *ADS';
    // office
    if (rand() < 0.45) exp({ on: ymd(y, m, int(1, 26)), vendor: pick(['Staples', 'Amazon.ca']), description: pick(['Notebooks & pens', 'USB-C hub', 'Printer paper & toner', 'Webcam light', 'Cables & adapters']), cat: 'Office supplies', by: pick([DS, GS]), from: ACC.card, total: money(between(18, 140)), tax: 'bcGoods' }).bankDesc = 'AMZN MKTP CA';
    // occasional parking / gas on personal cards
    if (rand() < 0.4) { const by = pick([DS, GS]); exp({ on: ymd(y, m, int(1, 27)), vendor: pick(['EasyPark', 'Impark']), description: 'Client site parking', cat: 'Vehicle & mileage', by, from: personalOf[by], total: money(between(4, 18)), tax: 'gstOnly', receipt: rand() < 0.5 }); }
  }
  // Trips
  for (const [on, by, where, project] of [['2025-03-11', DS, 'Vancouver', null], ['2025-06-03', GS, 'Vancouver', 'northshore-chat'], ['2025-09-15', GS, 'Toronto', 'maple-voice'], ['2026-07-08', GS, 'Halifax', 'harbourview-voice'], ['2026-05-20', DS, 'Calgary', 'prairie-chat']]) {
    const far = where === 'Toronto' || where === 'Halifax';
    exp({ on: addDays(on, -14), vendor: pick(['WestJet', 'Air Canada']), description: `Flight YKA–${where === 'Vancouver' ? 'YVR' : where === 'Calgary' ? 'YYC' : where === 'Toronto' ? 'YYZ' : 'YHZ'} return`, cat: 'Travel', by, from: ACC.card, total: money(far ? between(780, 1150) : between(320, 520)), tax: 'gstOnly', project }).bankDesc = 'WESTJET AIR';
    exp({ on, vendor: pick(['Hotel — Fairmont', 'Hotel — Sheraton', 'Hotel — Delta']), description: `${where} — ${far ? 2 : 1} nights`, cat: 'Travel', by, from: ACC.card, total: money(far ? between(520, 760) : between(240, 330)), tax: far ? 'gstOnly' : 'bcGoods', project }).bankDesc = 'HOTEL ' + where.toUpperCase();
    exp({ on, vendor: 'Uber', description: 'Airport transfers', cat: 'Travel', by, from: personalOf[by], total: money(between(38, 82)), tax: 'gstOnly', project, receipt: false });
  }
  exp({ on: '2025-10-23', vendor: 'Kamloops Innovation', description: 'Annual membership', cat: 'Licences, dues & memberships', by: DS, from: ACC.card, total: 262.5, tax: 'gstOnly' }).bankDesc = 'KAMLOOPS INNOVATION';
  exp({ on: '2026-03-18', vendor: 'Udemy', description: 'LLM evaluation course', cat: 'Training & education', by: GS, from: ACC.gsPersonal, total: 24.99, tax: 'gstOnly' });
  exp({ on: '2026-06-08', vendor: 'Web Summit Vancouver', description: 'Conference passes ×2', cat: 'Training & education', by: GS, from: ACC.card, total: 598, tax: 'gstOnly' }).bankDesc = 'WEB SUMMIT VANCOUVER';

  // Personal spending on the business card (→ shareholder loan)
  exp({ on: '2025-02-08', vendor: 'Save-On-Foods', description: 'Groceries — wrong card', cat: 'Other expenses', by: GS, from: ACC.card, total: 86.42, tax: 'none', nature: 'personal', receipt: false, notes: 'Paid back via e-Transfer.' }).bankDesc = 'SAVE ON FOODS #2280';
  exp({ on: '2025-11-29', vendor: 'Costco', description: 'Household — Black Friday', cat: 'Other expenses', by: DS, from: ACC.card, total: 214.67, tax: 'bcGoods', nature: 'personal', receipt: false }).bankDesc = 'COSTCO WHOLESALE W548';
  exp({ on: '2026-09-12', vendor: 'Netflix', description: 'Personal subscription — card on file by mistake', cat: 'Other expenses', by: DS, from: ACC.card, total: 20.99, tax: 'gstOnly', nature: 'personal', receipt: false }).bankDesc = 'NETFLIX.COM';
  exp({ on: '2026-09-19', vendor: 'Canadian Tire', description: 'Winter tires (personal) + dash cam (business)', cat: 'Vehicle & mileage', by: GS, from: ACC.card, total: 742.5, tax: 'bcGoods', nature: 'mixed', pct: 15 }).bankDesc = 'CANADIAN TIRE #614';

  // Recent month: a few still missing receipts
  exp({ on: '2026-09-26', vendor: 'The Noble Pig', description: 'Dinner — Thompson Valley Roofing pitch', cat: 'Meals & entertainment', by: DS, from: ACC.card, total: 118.4, tax: 'gstOnly', receipt: false }).bankDesc = 'NOBLE PIG BREWHOUSE';
  exp({ on: '2026-09-30', vendor: 'Staples', description: 'Label printer', cat: 'Office supplies', by: GS, from: ACC.card, total: 164.49, tax: 'bcGoods', receipt: false }).bankDesc = 'STAPLES STORE 316';

  // Settlement: quarterly reimbursements; mark settled
  const transfers = [];
  transfers.push({ id: uuid('xfer:ds-capital'), member_id: DS, occurred_on: '2024-09-25', kind: 'contribution', amount: 2500, account_id: ACC.eq, notes: 'Start-up shareholder loan' });
  transfers.push({ id: uuid('xfer:gs-capital'), member_id: GS, occurred_on: '2024-09-25', kind: 'contribution', amount: 2500, account_id: ACC.eq, notes: 'Start-up shareholder loan' });
  transfers.push({ id: uuid('xfer:gs-repay-groceries'), member_id: GS, occurred_on: '2025-02-10', kind: 'repayment', amount: 86.42, account_id: ACC.eq, notes: 'Groceries on business card' });
  const quarterEnds = ['2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'];
  for (const qe of quarterEnds) {
    for (const mem of [DS, GS]) {
      const owed = expenses.filter((e) => e.spent_by === mem && e.paid_from_account_id === personalOf[mem] && !e.settled && e.spent_on <= qe);
      const amt = money(owed.reduce((s, e) => s + money(e.total * e.fx_rate * e.business_pct / 100), 0));
      if (amt <= 0) continue;
      owed.forEach((e) => { e.settled = true; e.settled_on = addDays(qe, 6); });
      transfers.push({ id: uuid(`xfer:reimb:${mem}:${qe}`), member_id: mem, occurred_on: addDays(qe, 6), kind: 'reimbursement', amount: amt, account_id: ACC.eq, notes: `Out-of-pocket expenses to ${qe}` });
    }
  }
  expenses.filter((e) => e.nature === 'personal' && e.spent_on < '2026-01-01').forEach((e) => { e.settled = true; e.settled_on = addDays(e.spent_on, 2); });

  // Mileage
  const trips = [];
  const routes = [['Riverbend Family Clinic', 'riverbend', 9.4], ['Summit Field Services yard', 'summit', 14.2], ['Thompson Valley Roofing', 'thompson', 11.8], ['Okanagan Legal, Kelowna', 'okanagan', 330], ['Lakeside Auto, Vernon', 'lakeside', 236]];
  for (let i = 0; i < 34; i++) {
    const [dest, , km] = pick(routes);
    const by = rand() < 0.6 ? DS : GS;
    const on = addDays('2024-11-01', int(0, 695));
    trips.push({ id: uuid('trip:' + i), member_id: by, trip_on: on, origin: 'Tech Nerv office, Kamloops', destination: dest, purpose: pick(['Requirements workshop', 'Go-live support', 'Quarterly review', 'Discovery meeting', 'Staff training']),
      km: money(km * (km < 50 ? between(0.95, 1.1) : 1)), rate_per_km: 0.72, project_id: null, reimbursed: on < '2026-07-01' });
  }
  trips.sort((a, b) => a.trip_on.localeCompare(b.trip_on));
  for (const qe of quarterEnds) for (const mem of [DS, GS]) {
    const amt = money(trips.filter((t) => t.member_id === mem && t.trip_on <= qe && t.trip_on > addDays(qe, -92)).reduce((s, t) => s + t.km * t.rate_per_km, 0));
    if (amt > 0) transfers.push({ id: uuid(`xfer:mileage:${mem}:${qe}`), member_id: mem, occurred_on: addDays(qe, 6), kind: 'reimbursement', amount: amt, account_id: ACC.eq, notes: `Mileage to ${qe}` });
  }
  for (const t of transfers.filter((t) => t.kind === 'reimbursement')) bankRows.push({ account: ACC.eq, on: t.occurred_on, amount: -t.amount, description: `E-TRANSFER SENT ${t.member_id === DS ? 'DEEPARSH SINGH' : 'GURSAHIB SINGH'}`, match: { transfer: t.id } });

  sql.push(insert('recurring_expenses', recurringRows));
  sql.push(insert('expenses', expenses.map(({ bankDesc, ...e }) => ({ ...e, settled_on: e.settled_on ?? null }))));
  sql.push(insert('member_transfers', transfers.map((t) => ({ ...t, created_at: t.occurred_on + 'T20:00:00Z' }))));
  sql.push(insert('mileage_trips', trips));

  // ───────────── bank & card feed (CSV-style) ─────────────
  for (const e of expenses) {
    if (![ACC.eq, ACC.card].includes(e.paid_from_account_id) || e.spent_on > TODAY) continue;
    const cad = money(e.total * e.fx_rate);
    bankRows.push({ account: e.paid_from_account_id, on: addDays(e.spent_on, e.paid_from_account_id === ACC.card ? 1 : 0), amount: -cad,
      description: e.bankDesc ?? e.vendor.toUpperCase(), match: { expense: e.id } });
  }
  // Monthly card payments from EQ (internal transfer → ignored)
  for (const [y, m] of monthsBetween(2024, 11, 2026, 9)) {
    const start = m === 1 ? ymd(y - 1, 12, 1) : ymd(y, m - 1, 1);
    const cardSpend = money(bankRows.filter((r) => r.account === ACC.card && r.on >= start && r.on < ymd(y, m, 1)).reduce((s, r) => s - r.amount, 0));
    if (cardSpend > 0) {
      bankRows.push({ account: ACC.eq, on: ymd(y, m, 20), amount: -cardSpend, description: 'BILL PAYMENT BUSINESS VISA', match: { ignore: true } });
      bankRows.push({ account: ACC.card, on: ymd(y, m, 21), amount: cardSpend, description: 'PAYMENT - THANK YOU', match: { ignore: true } });
    }
  }
  for (const t of transfers.filter((t) => t.kind === 'contribution' || t.kind === 'repayment')) bankRows.push({ account: ACC.eq, on: t.occurred_on, amount: t.amount, description: `INTERAC E-TRANSFER DEPOSIT ${t.member_id === DS ? 'DEEPARSH SINGH' : 'GURSAHIB SINGH'}`, match: { transfer: t.id } });
  // Interest on EQ savings
  const income = [];
  for (const [y, m] of monthsBetween(2024, 10, 2026, 9)) {
    const on = ymd(y, m, 28), amount = money(between(4, 38)), id = uuid('income:interest:' + on);
    income.push({ id, received_on: on, source: 'EQ Bank', description: 'Interest on business savings', category_id: cats['Interest income'], account_id: ACC.eq, currency: 'CAD', amount, created_by: DS, created_at: on + 'T21:00:00Z' });
    bankRows.push({ account: ACC.eq, on, amount, description: 'INTEREST PAID', match: { income: id } });
  }
  // Unmatched, still-to-review items
  bankRows.push({ account: ACC.card, on: '2026-09-22', amount: -54.13, description: 'SQ *KAMLOOPS COFFEE CO', match: null });
  bankRows.push({ account: ACC.card, on: '2026-09-27', amount: -219.0, description: 'LINKEDIN PREMIUM', match: null });
  bankRows.push({ account: ACC.card, on: '2026-09-29', amount: -12.6, description: 'APPLE.COM/BILL', match: null });
  bankRows.push({ account: ACC.eq, on: '2026-09-30', amount: -25.0, description: 'SERVICE CHARGE WIRE IN', match: null });
  bankRows.push({ account: ACC.card, on: '2026-10-01', amount: -31.49, description: 'PETRO-CANADA 4410', match: null });

  bankRows.sort((a, b) => a.on.localeCompare(b.on) || b.amount - a.amount);
  const balances = {}; const batches = {}; const txns = [];
  const REVIEW_FROM = '2026-09-15';
  for (const r of bankRows) {
    if (r.on > TODAY) continue;
    balances[r.account] = money((balances[r.account] ?? 0) + r.amount);
    const month = r.on.slice(0, 7);
    const bKey = `${r.account}:${month}`;
    const acct = accounts.find((a) => a.id === r.account);
    batches[bKey] ??= { id: uuid('batch:' + bKey), account_id: r.account, file_name: `${acct.kind === 'credit_card' ? 'business-visa' : 'eq-business'}-${month}.csv`, rows_total: 0, rows_imported: 0, rows_duplicate: 0, date_from: r.on, date_to: r.on, imported_by: r.account === ACC.card ? GS : DS, created_at: `${addDays(r.on.slice(0, 7) + '-28', 5)}T03:00:00Z` };
    const b = batches[bKey]; b.rows_total++; b.rows_imported++; b.date_to = r.on;
    const recent = r.on >= REVIEW_FROM;
    let status = 'unreviewed', mE = null, mP = null, mT = null, mI = null;
    if (r.match && !recent) {
      if (r.match.ignore) status = 'ignored';
      else { status = 'matched'; mE = r.match.expense ?? null; mP = r.match.payment ?? null; mT = r.match.transfer ?? null; mI = r.match.income ?? null; }
    }
    const id = uuid(`btx:${r.account}:${r.on}:${r.amount}:${r.description}:${txns.length}`);
    txns.push({ id, account_id: r.account, posted_on: r.on, description: r.description, amount: r.amount, balance_after: balances[r.account], source: 'csv', external_id: null,
      dedupe_hash: createHash('md5').update(`${r.on}|${r.amount}|${r.description}|${txns.length}`).digest('hex'), status,
      matched_expense_id: mE, matched_payment_id: mP, matched_transfer_id: mT, matched_income_id: mI, import_batch: b.id, created_at: b.created_at });
    if (mE) { const e = expenses.find((x) => x.id === mE); if (e) e.bank_transaction_id = id; }
  }
  // Recent month's import happened "today"
  for (const b of Object.values(batches)) if (b.date_from >= '2026-09-01' || b.date_to >= '2026-09-01') b.created_at = '2026-10-01T22:14:00Z';
  sql.push(insert('import_batches', Object.values(batches)));
  sql.push(insert('other_income', income));
  sql.push(insert('bank_transactions', txns));
  sql.push(expenses.filter((e) => e.bank_transaction_id).map((e) => `update accounts.expenses set bank_transaction_id = '${e.bank_transaction_id}', source = case when source = 'manual' then 'bank_import' else source end where id = '${e.id}';`).join('\n'));

  sql.push(`update accounts.money_accounts set csv_mapping = '{"preset":"eq_bank","date":"Transfer date","description":"Description","amount":"Amount","balance":"Balance","dateFormat":"yyyy-MM-dd"}' where institution = 'EQ Bank';
    update accounts.money_accounts set csv_mapping = '{"preset":"generic_card","date":"Transaction Date","description":"Description","debit":"Debit","credit":"Credit","dateFormat":"MM/dd/yyyy"}' where kind = 'credit_card';`);

  // ───────────── rules ─────────────
  const rules = [
    ['OPENAI', 'Cloud, hosting & APIs', 'business', 'OpenAI'], ['TWILIO', 'Cloud, hosting & APIs', 'business', 'Twilio'], ['ANTHROPIC', 'Software & subscriptions', 'business', 'Anthropic'],
    ['GOOGLE*WORKSPACE', 'Software & subscriptions', 'business', 'Google Workspace'], ['GOOGLE *ADS', 'Advertising & marketing', 'business', 'Google Ads'],
    ['MICROSOFT*AZURE', 'Cloud, hosting & APIs', 'business', 'Microsoft Azure'], ['VERCEL', 'Cloud, hosting & APIs', 'business', 'Vercel'], ['FIGMA', 'Software & subscriptions', 'business', 'Figma'],
    ['GITHUB', 'Software & subscriptions', 'business', 'GitHub'], ['TELUS', 'Internet & phone', 'mixed', 'Telus'], ['AMZN MKTP', 'Office supplies', 'business', 'Amazon.ca'],
    ['WESTJET', 'Travel', 'business', 'WestJet'], ['NETFLIX', 'Other expenses', 'personal', 'Netflix'], ['LINKEDIN', 'Advertising & marketing', 'business', 'LinkedIn'],
    ['PETRO-CANADA', 'Vehicle & mileage', 'business', 'Petro-Canada'],
  ];
  sql.push(insert('rules', rules.map(([match_text, cat, nature, vendor_rename], i) => ({ id: uuid('rule:' + match_text), match_text, category_id: cats[cat], nature, vendor_rename, project_id: null, priority: 0, times_applied: int(2, 24) }))));

  // ───────────── documents & filings ─────────────
  const docs = [
    ['Certificate of Incorporation', 'corporate', 2024, '2024-08-15', null, 'BC Registry — BC1400000'],
    ['Notice of Articles', 'corporate', 2024, '2024-08-15', null, null],
    ['Shareholder agreement (signed)', 'corporate', 2024, '2024-10-30', null, '50/50, drag-along and buy-sell clauses'],
    ['GST/HST registration confirmation', 'gst_return', 2024, '2024-09-03', null, 'Annual filer · fiscal year-end Sept 30'],
    ['GST/HST return FY2025', 'gst_return', 2025, '2025-12-15', null, 'Filed via My Business Account'],
    ['T2 corporate return FY2025', 't2_return', 2025, '2026-03-20', null, 'Prepared by Northline CPA'],
    ['Notice of Assessment — T2 FY2025', 'notice_of_assessment', 2025, '2026-05-06', null, 'Assessed as filed'],
    ['Professional liability policy 2026', 'insurance', 2026, '2026-01-15', '2027-01-15', 'Cascade Business Insurance'],
    ['Master services agreement — Riverbend', 'contract', 2025, '2024-10-30', null, null],
    ['Master services agreement — Harbourview', 'contract', 2026, '2026-06-30', '2027-06-30', null],
    ['EQ Bank statement — Sept 2026', 'statement', 2026, '2026-09-30', null, null],
    ['BC annual report 2025', 'corporate', 2025, '2025-09-18', null, 'Filed with BC Registry'],
  ];
  const docRows = docs.map(([title, doc_type, fiscal_year, issued_on, expires_on, notes]) => ({ id: uuid('doc:' + title), title, doc_type, fiscal_year, issued_on, expires_on, notes, created_at: issued_on + 'T20:00:00Z' }));
  sql.push(insert('documents', docRows));

  sql.push(insert('tax_filings', [
    { kind: 'gst', period_start: '2024-08-15', period_end: '2025-09-30', due_on: '2025-12-31', filed_on: '2025-12-15', confirmation: 'GST-25-4471923', amount_owing: null, paid_on: '2025-12-15', notes: 'First annual return (stub period from registration)' },
    { kind: 't2', period_start: '2024-08-15', period_end: '2025-09-30', due_on: '2026-03-31', filed_on: '2026-03-20', confirmation: 'T2-25-0098812', amount_owing: null, paid_on: '2025-12-29', notes: 'Balance due Dec 31 (CCPC, 3 months)' },
    { kind: 'gst', period_start: '2025-10-01', period_end: '2026-09-30', due_on: '2026-12-31', filed_on: null, confirmation: null, amount_owing: null, paid_on: null, notes: null },
    { kind: 't2', period_start: '2025-10-01', period_end: '2026-09-30', due_on: '2027-03-31', filed_on: null, confirmation: null, amount_owing: null, paid_on: null, notes: 'Tax balance payable by Dec 31, 2026' },
    { kind: 'other', period_start: '2025-08-15', period_end: '2026-08-15', due_on: '2026-10-15', filed_on: null, confirmation: null, amount_owing: 43.39, paid_on: null, notes: 'BC Registry annual report (within 2 months of anniversary)' },
  ].map((f) => ({ id: uuid(`filing:${f.kind}:${f.period_end}`), ...f }))));

  // ───────────── files: receipts + document PDFs ─────────────
  const attach = [];
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a]));
  for (const e of expFiles) {
    const svg = receiptSvg({ vendor: e.vendor, date: e.spent_on, description: e.description, subtotal: e.subtotal, gst: e.gst_hst, pst: e.pst, total: e.total, currency: e.currency,
      card: accName[e.paid_from_account_id].kind === 'personal' ? 'VISA ••••' + String(int(1000, 9999)) : `VISA ••••${accName[e.paid_from_account_id].last4 ?? '2081'}`, seed: e.id });
    const path = `receipts/${e.spent_on.slice(0, 4)}/${e.id}.svg`;
    const body = Buffer.from(svg);
    files.push({ path, type: 'image/svg+xml', body });
    attach.push({ id: uuid('att:' + e.id), entity_type: 'expense', entity_id: e.id, storage_path: path, file_name: `${e.vendor.replace(/[^\w]+/g, '-').toLowerCase()}-${e.spent_on}.svg`,
      mime_type: 'image/svg+xml', size_bytes: body.length, original_size_bytes: body.length, compression: null, uploaded_by: e.spent_by, created_at: e.created_at });
  }
  for (const d of docRows) {
    const pdf = simplePdf(d.title, [`Tech Nerv Solutions Inc.`, `Issued ${d.issued_on}`, d.notes ?? '', '', 'SAMPLE DOCUMENT — synthetic data for the demo.']);
    const path = `documents/${d.fiscal_year}/${d.id}.pdf`;
    files.push({ path, type: 'application/pdf', body: pdf });
    attach.push({ id: uuid('att:' + d.id), entity_type: 'document', entity_id: d.id, storage_path: path, file_name: `${d.title.replace(/[^\w]+/g, '-').toLowerCase()}.pdf`,
      mime_type: 'application/pdf', size_bytes: pdf.length, original_size_bytes: pdf.length, compression: null, uploaded_by: DS, created_at: d.created_at });
  }
  sql.push(insert('attachments', attach));

  // ───────────── believable history ─────────────
  sql.push(`
    truncate accounts.activity_log;
    insert into accounts.activity_log (member_id, entity_type, entity_id, action, summary, created_at)
    select created_by, 'invoices', id, 'insert', number, created_at from accounts.invoices
    union all select created_by, 'invoices', id, 'sent', number, sent_at from accounts.invoices where sent_at is not null
    union all select recorded_by, 'payments', id, 'insert', reference, created_at from accounts.payments
    union all select created_by, 'expenses', id, 'insert', vendor, created_at from accounts.expenses
    union all select member_id, 'member_transfers', id, 'insert', kind || ' ' || amount, created_at from accounts.member_transfers
    union all select imported_by, 'import_batches', id, 'insert', file_name, created_at from accounts.import_batches
    order by 6;
  `);

  return { sql, files };
}
