import { NextResponse, type NextRequest } from 'next/server';
import JSZip from 'jszip';
import { gunzipSync } from 'node:zlib';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { num } from '@/lib/format';
import { toCsv, BOM } from '@/components/reports/csv';
import { taxContext, periodFor, fetchAll, referenceData, loadSales, loadExpenses, loadOtherIncome, loadMileage, memberBalancesAt, receivablesAt, accountBalancesAt } from '@/components/tax/books';
import { incomeStatement, capitalSchedule, taxEstimate } from '@/components/tax/income';
import { gstReturn, type Worksheet } from '@/components/tax/gst';
import { readiness, gstFor } from '@/components/tax/readiness';
import { addDaysIso } from '@/components/tax/period';
import { renderSummaryPdf } from '@/components/tax/summary-pdf';

export const maxDuration = 120;

/**
 * GET /api/exports/year-end?fy=2026
 * Zip for the accountant: CSVs + every receipt file for the year + summary PDF.
 * Built in memory (a year is a few hundred small receipts), sent with a
 * Content-Length so the browser can show real progress.
 */
export async function GET(req: NextRequest) {
  const me = await currentMember();
  const ctx = await taxContext();
  const fy = Number(req.nextUrl.searchParams.get('fy') ?? ctx.defaultFy);
  if (!ctx.years.includes(fy)) return new NextResponse(`No fiscal year ${fy}`, { status: 400 });
  const p = periodFor(ctx, fy);
  const supabase = await db();
  const ref = await referenceData();
  const acct = new Map(ref.accounts.map((a) => [a.id, a]));
  const memberName = new Map(ref.members.map((m) => [m.id, m.full_name]));
  const gstFiling = gstFor(ctx, p);

  const [sales, expenses, other, trips, income, cca, gst, balances, ar, cash, ready, payments, bank, ledger, openingLedger, attachments] = await Promise.all([
    loadSales(p), loadExpenses(p), loadOtherIncome(p), loadMileage(p), incomeStatement(p), capitalSchedule(fy, ctx, p),
    gstReturn(p, { worksheet: (gstFiling?.worksheet ?? {}) as Worksheet }), memberBalancesAt(p.end), receivablesAt(p.end), accountBalancesAt(p.end), readiness(ctx, p),
    fetchAll((f, t) => supabase.from('payments').select('*, clients(display_name), payment_allocations(amount, invoices(number))').gte('received_on', p.start).lte('received_on', p.end).order('received_on').range(f, t)),
    fetchAll((f, t) => supabase.from('bank_transactions').select('*').gte('posted_on', p.start).lte('posted_on', p.end).order('posted_on').order('created_at').range(f, t)),
    fetchAll((f, t) => supabase.from('member_ledger').select('*').gte('occurred_on', p.start).lte('occurred_on', p.end).order('occurred_on').range(f, t)),
    memberBalancesAt(addDaysIso(p.start, -1)),
    fetchAll((f, t) => supabase.from('attachments').select('*').eq('entity_type', 'expense').range(f, t)),
  ]);

  const zip = new JSZip();
  const root = zip.folder(`TechNerv-FY${fy}`)!;
  const put = (name: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) => root.file(name, BOM + toCsv(headers, rows));

  // ── invoices ──
  put('invoices.csv',
    ['number', 'kind', 'status', 'issue_date', 'due_date', 'client', 'client_province', 'client_country', 'currency', 'fx_rate', 'subtotal (credit notes negative)', 'tax', 'total', 'net_cad', 'tax_cad', 'total_cad', 'balance_today', 'tax_codes'],
    sales.map((d) => [d.number, d.kind, d.status, d.issue_date, d.due_date, d.client.name, d.client.province, d.client.country, d.currency, d.fx,
      round(d.netCad / (d.fx || 1)), round(d.taxCad / (d.fx || 1)), d.sign * d.total, round(d.netCad), round(d.taxCad), round(d.totalCad), d.balance, [...new Set(d.lines.map((l) => l.code))].join(' ')]));

  // ── payments ──
  put('payments.csv',
    ['received_on', 'client', 'amount', 'currency', 'fx_rate', 'amount_cad', 'method', 'deposit_account', 'reference', 'applied_to', 'notes'],
    payments.map((py) => {
      const allocs = (py.payment_allocations ?? []) as unknown as { amount: number; invoices: { number: string } | null }[];
      return [py.received_on, (py.clients as unknown as { display_name: string } | null)?.display_name, num(py.amount), py.currency, num(py.fx_rate), round(num(py.amount) * num(py.fx_rate)), py.method,
        py.deposit_account_id ? acct.get(py.deposit_account_id)?.name : '', py.reference, allocs.map((a) => `${a.invoices?.number ?? '?'} ${num(a.amount).toFixed(2)}`).join('; '), py.notes];
    }));

  // ── expenses + receipts ──
  const attByExpense = new Map<string, typeof attachments>();
  for (const a of attachments) { const l = attByExpense.get(a.entity_id) ?? []; l.push(a); attByExpense.set(a.entity_id, l); }
  const receiptFiles: { path: string; storage: string; gzip: boolean }[] = [];
  const expenseRows = expenses.map((e) => {
    const files = attByExpense.get(e.id) ?? [];
    const names = files.map((a, i) => {
      const clean = a.file_name.replace(/\.gz$/, '');
      const ext = clean.includes('.') ? clean.split('.').pop() : 'bin';
      const name = `receipts/${e.spent_on}_${slug(e.vendor)}_${e.id.slice(0, 8)}${files.length > 1 ? `-${i + 1}` : ''}.${ext}`;
      receiptFiles.push({ path: name, storage: a.storage_path, gzip: a.compression === 'gzip' });
      return name;
    });
    return [e.spent_on, e.vendor, e.description, e.category_name, e.gifi_code, e.is_capital, e.ccaClass, e.nature, num(e.effective_business_pct), e.spent_by_name, e.paid_from_name, e.paid_from_kind,
      e.currency, num(e.subtotal), num(e.gst_hst), num(e.pst), num(e.total), num(e.fx_rate), num(e.total_cad), e.businessCad, e.gstPaidCad, e.itc, e.bookCad, e.deductiblePct, e.is_capital ? 0 : e.deductibleCad, e.personalCad,
      files.length > 0, names.join('; '), e.id];
  });
  put('expenses.csv',
    ['date', 'vendor', 'description', 'category', 'gifi', 'capital', 'cca_class', 'nature', 'business_pct', 'spent_by', 'paid_from', 'paid_from_kind',
      'currency', 'subtotal', 'gst_hst', 'pst', 'total', 'fx_rate', 'total_cad', 'business_cad', 'gst_paid_cad', 'itc_cad', 'book_expense_cad', 'deductible_pct', 'deductible_cad', 'personal_cad',
      'receipt_attached', 'receipt_files', 'id'],
    expenseRows);

  // ── GIFI ──
  put('gifi-summary.csv', ['gifi', 'description', 'detail', 'amount_cad'], [
    ...income.revenue.flatMap((l) => [[l.gifi, l.label, '', l.amount], ...l.parts.map((x) => [l.gifi, l.label, `${x.name} (${x.count})`, x.amount])]),
    ['8299', 'Total revenue', '', income.totalRevenue],
    ...income.expenses.flatMap((l) => [[l.gifi, l.label, '', l.amount], ...l.parts.map((x) => [l.gifi, l.label, `${x.name} (${x.count})`, x.amount])]),
    ['9368', 'Total expenses', '', income.totalExpenses],
    ['9970', 'Net income/loss before taxes and extraordinary items', '', income.netIncome],
    ['', 'Schedule 1: add back 50% of meals and entertainment', '', income.mealsAddBack],
    ['', 'Schedule 8: CCA estimate (maximum claim)', '', cca.totalCca],
  ] as (string | number)[][]);

  // ── capital assets ──
  put('capital-assets.csv', ['date', 'vendor', 'description', 'category', 'cca_class', 'capital_cost_cad', 'fiscal_year', 'receipt_attached'],
    cca.assets.filter((a) => a.fy <= fy).map((a) => [a.spent_on, a.vendor, a.description, a.category, a.ccaClass, a.cost, `FY${a.fy}`, a.attachments > 0]));
  put('cca-schedule.csv', ['fiscal_year', 'class', 'rate', 'opening_ucc', 'additions', 'first_year_rule', 'cca_estimate', 'closing_ucc', 'note'],
    [...cca.byYear.entries()].flatMap(([y, rows]) => rows.map((r) => [`FY${y}`, r.ccaClass, r.rate, r.opening, r.additions, r.rule, r.cca, r.closing, r.proposed ?? ''])));

  // ── mileage ──
  put('mileage-log.csv', ['date', 'member', 'origin', 'destination', 'purpose', 'km', 'rate_per_km', 'amount_cad', 'reimbursed'],
    trips.map((t) => [t.trip_on, memberName.get(t.member_id), t.origin, t.destination, t.purpose, num(t.km), num(t.rate_per_km), t.amountCad, t.reimbursed]));

  // ── owner ledger ──
  put('owner-ledger.csv', ['date', 'member', 'type', 'kind', 'label', 'detail', 'total_cad', 'amount_cad (+ company owes member)', 'settled', 'repay_by'], [
    ...openingLedger.map((b) => [p.start, b.member.full_name, 'opening', 'balance', 'Opening balance', '', '', b.balance, '', '']),
    ...ledger.map((l) => [l.occurred_on, memberName.get(l.member_id ?? ''), l.entry_type, l.kind, l.label, l.detail, num(l.total_cad), num(l.amount), l.settled, l.repay_by]),
    ...balances.map((b) => [p.end, b.member.full_name, 'closing', 'balance', 'Balance at year-end', '', '', b.balance, '', '']),
  ]);

  // ── bank ──
  put('bank-transactions.csv', ['date', 'account', 'currency', 'description', 'amount', 'balance_after', 'status', 'matched_to'],
    bank.map((t) => [t.posted_on, acct.get(t.account_id)?.name, acct.get(t.account_id)?.currency, t.description, num(t.amount), t.balance_after == null ? null : num(t.balance_after), t.status,
      t.matched_expense_id ? 'expense' : t.matched_payment_id ? 'payment' : t.matched_transfer_id ? 'owner transfer' : t.matched_income_id ? 'other income' : '']));

  put('other-income.csv', ['date', 'source', 'description', 'category', 'gifi', 'currency', 'amount', 'gst_hst', 'fx_rate', 'amount_cad'],
    other.map((o) => [o.received_on, o.source, o.description, o.category, o.gifi, o.currency, num(o.amount), num(o.gst_hst), num(o.fx_rate), o.amountCad]));

  const L = ctx.profile.gst_quick_method ? gst.quick.lines : gst.lines;
  put('gst-return.csv', ['line', 'amount_cad'], Object.entries(L).map(([k, v]) => [k.replace(/^l/, ''), v]));

  put('balances-at-year-end.csv', ['what', 'name', 'currency', 'amount', 'amount_cad'], [
    ...cash.map((c) => ['bank/card', c.account.name, c.account.currency, c.balance, c.balanceCad]),
    ...balances.map((b) => ['shareholder', b.member.full_name, 'CAD', b.balance, b.balance]),
    ...ar.open.map((i) => ['receivable', `${i.number} · ${i.client} · ${i.bucket}`, i.currency, i.balance, i.balanceCad]),
  ]);

  // ── receipt files (16 at a time) ──
  let missingFiles = 0;
  for (let i = 0; i < receiptFiles.length; i += 16) {
    await Promise.all(receiptFiles.slice(i, i + 16).map(async (f) => {
      const { data, error } = await supabase.storage.from('accounts').download(f.storage);
      if (error || !data) { missingFiles++; return; }
      let buf: Buffer = Buffer.from(await data.arrayBuffer());
      if (f.gzip) { try { buf = gunzipSync(buf); } catch { /* keep as stored */ } }
      root.file(f.path, buf);
    }));
  }

  // ── summary PDF ──
  const est = taxEstimate(income.netIncome, income.mealsAddBack, cca.totalCca);
  const pr = ctx.profile;
  const pdf = await renderSummaryPdf({
    company: { legal: pr.legal_name, bn: pr.business_number, gst: pr.gst_number, address: [pr.address_line1, pr.city, pr.province, pr.postal_code].filter(Boolean).join(', ') },
    fy, start: p.start, end: p.end, generated: format(new Date(), 'MMM d, yyyy'), preparedBy: me.full_name,
    income: { revenue: income.revenue, expenses: income.expenses, totalRevenue: income.totalRevenue, totalExpenses: income.totalExpenses, netIncome: income.netIncome },
    adjustments: { meals: income.mealsAddBack, cca: cca.totalCca, taxable: est.taxable, tax: est.tax, rate: est.rate },
    gst: { l101: L.l101, l103: L.l103, l106: L.l106, l109: L.l109, method: pr.gst_quick_method ? 'Quick method' : 'Regular method', filed: gstFiling?.filed_on ? `${gstFiling.filed_on}${gstFiling.confirmation ? ` · ${gstFiling.confirmation}` : ''}` : null },
    balances: balances.map((b) => ({ name: b.member.full_name, balance: b.balance })),
    ar: ar.buckets.map((b) => ({ label: b.label, total: b.total })), arTotal: ar.total,
    cash: cash.map((c) => ({ name: c.account.name, currency: c.account.currency, balance: c.balance, balanceCad: c.balanceCad })),
    assets: cca.schedule.map((r) => ({ ccaClass: r.ccaClass, additions: r.additions, cca: r.cca, closing: r.closing, rule: r.rule })),
    readiness: ready.checks.map((c) => ({ title: c.title, done: c.state === 'done' })),
    counts: {
      invoices: sales.length, expenses: expenses.length, receipts: receiptFiles.length - missingFiles,
      missingReceipts: expenses.filter((e) => e.nature !== 'personal' && !num(e.attachment_count)).length, trips: trips.length, bankTxns: bank.length,
    },
  });
  root.file(`summary-FY${fy}.pdf`, pdf);
  root.file('README.txt', [
    `Tech Nerv Solutions Inc. — FY${fy} year-end package (${p.start} to ${p.end})`,
    `Generated ${new Date().toISOString()} by ${me.full_name}.`,
    '',
    'All amounts in CAD unless a currency column says otherwise.',
    'Revenue is before GST/HST. Expenses (book_expense_cad) are the business share less ITCs claimed.',
    'deductible_cad applies the 50% meals limit. Capital purchases are in capital-assets.csv and not in the GIFI expenses.',
    'CCA and tax figures are estimates assuming the maximum claim — confirm before filing.',
    missingFiles ? `${missingFiles} receipt file(s) could not be read from storage.` : 'Every attached receipt is in receipts/.',
  ].join('\n'));

  const body = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="TechNerv-FY${fy}-year-end.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vendor'; }
