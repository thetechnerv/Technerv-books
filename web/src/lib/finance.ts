import 'server-only';
import { format, subMonths, startOfMonth } from 'date-fns';
import { db, must } from './db';
import { fiscalRange } from './fiscal';
import { num, round2 } from './format';

/** Latest running balance per bank / card account, from the imported feed. */
export async function cashPositions() {
  const supabase = await db();
  const accounts = must(await supabase.from('money_accounts').select('*').eq('archived', false).order('kind'));
  const usd = await latestRate('USD');
  const out = [];
  for (const a of accounts) {
    if (a.kind === 'personal') continue;
    const last = must(await supabase.from('bank_transactions').select('balance_after, posted_on').eq('account_id', a.id)
      .order('posted_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle());
    const balance = num(a.opening_balance) + num(last?.balance_after);
    out.push({ ...a, balance, balanceCad: round2(balance * (a.currency === 'USD' ? usd : 1)), asOf: last?.posted_on ?? null });
  }
  return out;
}

export async function receivables() {
  const supabase = await db();
  const open = must(await supabase.from('invoice_overview').select('id, number, client_name, balance, currency, fx_rate, due_date, is_overdue, days_overdue, status')
    .eq('kind', 'invoice').in('status', ['sent', 'partial']));
  const cad = (i: (typeof open)[number]) => num(i.balance) * num(i.fx_rate);
  return {
    open,
    total: round2(open.reduce((s, i) => s + cad(i), 0)),
    overdue: round2(open.filter((i) => i.is_overdue).reduce((s, i) => s + cad(i), 0)),
    overdueCount: open.filter((i) => i.is_overdue).length,
  };
}

/**
 * GST/HST summary for a period on the accrual basis CRA uses for the regular
 * method: tax charged on invoices issued in the period (less credit notes),
 * minus input tax credits on business expenses dated in the period.
 */
export async function gstSummary(start: string, end: string) {
  const supabase = await db();
  const docs = must(await supabase.from('invoices').select('kind, tax_total, subtotal, discount, fx_rate, status')
    .in('kind', ['invoice', 'credit_note']).not('status', 'in', '(draft,void)').gte('issue_date', start).lte('issue_date', end));
  const exps = must(await supabase.from('expense_overview').select('itc_cad, is_capital').gte('spent_on', start).lte('spent_on', end));
  const sign = (k: string) => (k === 'credit_note' ? -1 : 1);
  const sales = round2(docs.reduce((s, d) => s + sign(d.kind) * (num(d.subtotal) - num(d.discount)) * num(d.fx_rate), 0));
  const collected = round2(docs.reduce((s, d) => s + sign(d.kind) * num(d.tax_total) * num(d.fx_rate), 0));
  const itcs = round2(exps.reduce((s, e) => s + num(e.itc_cad), 0));
  return { sales, collected, itcs, net: round2(collected - itcs) };
}

export async function gstForFiscalYear(fy: number, yearEnd: string) {
  const r = fiscalRange(fy, yearEnd);
  return { ...r, ...(await gstSummary(r.start, r.end)) };
}

/** Revenue (pre-tax, CAD) vs business spending per month for the last `months` months. */
export async function monthlySeries(months = 12) {
  const supabase = await db();
  const from = format(startOfMonth(subMonths(new Date(), months - 1)), 'yyyy-MM-dd');
  const [docs, exps] = await Promise.all([
    supabase.from('invoices').select('kind, issue_date, subtotal, discount, fx_rate').in('kind', ['invoice', 'credit_note']).not('status', 'in', '(draft,void)').gte('issue_date', from),
    supabase.from('expense_overview').select('spent_on, total_cad, effective_business_pct').gte('spent_on', from),
  ]);
  const buckets = new Map<string, { month: string; in: number; out: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const m = format(subMonths(new Date(), i), 'yyyy-MM');
    buckets.set(m, { month: m, in: 0, out: 0 });
  }
  for (const d of must(docs)) {
    const b = buckets.get(d.issue_date.slice(0, 7));
    if (b) b.in += (d.kind === 'credit_note' ? -1 : 1) * (num(d.subtotal) - num(d.discount)) * num(d.fx_rate);
  }
  for (const e of must(exps)) {
    const b = buckets.get((e.spent_on ?? '').slice(0, 7));
    if (b) b.out += num(e.total_cad) * num(e.effective_business_pct) / 100;
  }
  return [...buckets.values()].map((b) => ({ ...b, in: round2(b.in), out: round2(b.out) }));
}

/** Most recent stored rate to CAD (Bank of Canada), falling back to 1.4 for USD. */
export async function latestRate(currency: string) {
  if (currency === 'CAD') return 1;
  const supabase = await db();
  const r = must(await supabase.from('fx_rates').select('rate_to_cad').eq('currency', currency).order('rate_date', { ascending: false }).limit(1).maybeSingle());
  return num(r?.rate_to_cad) || 1.4;
}
