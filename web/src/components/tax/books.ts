import 'server-only';
import { cache } from 'react';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { num, round2 } from '@/lib/format';
import type { Row, View } from '@/lib/types';
import { defaultFiscalYear, fyOf, fyOfDate, fyPeriod, monthsOf, resolvePeriod, type Period } from './period';

/**
 * Shared loaders for the Tax Centre, Reports and the year-end export.
 * Everything is converted to CAD at the rate stored on the record
 * (invoice / expense / payment fx_rate), the way CRA expects amounts reported.
 */

const r2 = round2;

/** Pages through a PostgREST query so large years never hit the 1,000-row cap. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const res = await page(from, from + size - 1);
    if (res.error) throw new Error(res.error.message);
    out.push(...(res.data ?? []));
    if (!res.data || res.data.length < size) break;
  }
  return out;
}

// ───────────────────────── Context ─────────────────────────

export const taxContext = cache(async () => {
  const [profile, supabase] = await Promise.all([businessProfile(), db()]);
  const filings = must(await supabase.from('tax_filings').select('*').order('due_on', { ascending: true }));
  const yearEnd = profile.fiscal_year_end;
  const fyNow = fyOf(new Date(), yearEnd);
  const first = profile.incorporated_on ?? profile.gst_registered_on;
  const firstFy = first ? fyOfDate(first, yearEnd, filings) : fyNow - 1;
  const years: number[] = [];
  for (let y = fyNow; y >= Math.min(firstFy, fyNow); y--) years.push(y);
  const defaultFy = Math.max(Math.min(defaultFiscalYear(yearEnd), fyNow), years[years.length - 1]!);
  return { profile, filings, yearEnd, fyNow, defaultFy, years };
});
export type TaxContext = Awaited<ReturnType<typeof taxContext>>;

export async function periodFromParams(sp: { fy?: string; from?: string; to?: string }) {
  const ctx = await taxContext();
  return { ctx, period: resolvePeriod(sp, ctx) };
}

export function periodFor(ctx: TaxContext, fy: number): Period {
  return fyPeriod(fy, ctx.yearEnd, ctx.filings);
}

// ───────────────────────── Reference data ─────────────────────────

export const referenceData = cache(async () => {
  const supabase = await db();
  const [rates, cats, accounts, members, clients] = await Promise.all([
    supabase.from('tax_rates').select('*'),
    supabase.from('categories').select('*').order('sort'),
    supabase.from('money_accounts').select('*').order('kind'),
    supabase.from('members').select('*').order('full_name'),
    supabase.from('clients').select('id, display_name, province, country, currency'),
  ]);
  const rateById = new Map(must(rates).map((r) => [r.id, r]));
  const catById = new Map(must(cats).map((c) => [c.id, c]));
  return { rates: must(rates), rateById, cats: must(cats), catById, accounts: must(accounts), members: must(members), clients: must(clients) };
});

// ───────────────────────── Sales (invoices + credit notes) ─────────────────────────

export type SalesLine = {
  amountCad: number; taxCad: number; code: string; rateKind: string; rate: number; taxProvince: string | null;
  category: string | null; gifi: string;
};
export type SalesDoc = {
  id: string; number: string; kind: 'invoice' | 'credit_note'; status: string; issue_date: string; due_date: string | null;
  currency: string; fx: number; sign: 1 | -1; client: { id: string; name: string; province: string | null; country: string };
  netCad: number; taxCad: number; totalCad: number; total: number; balance: number; lines: SalesLine[];
};

/** Issued invoices and credit notes (not drafts, not void) dated in the period. Credit notes carry sign −1. */
export function loadSales(p: { start: string; end: string }) { return _loadSales(p.start, p.end); }
const _loadSales = cache(async (start: string, end: string): Promise<SalesDoc[]> => {
  const p = { start, end };
  const supabase = await db();
  const ref = await referenceData();
  const itemCat = new Map(must(await supabase.from('items').select('id, category_id')).map((i) => [i.id, i.category_id]));
  const rows = await fetchAll((from, to) =>
    supabase.from('invoices')
      .select('id, number, kind, status, issue_date, due_date, currency, fx_rate, subtotal, discount, tax_total, total, balance, client_id, clients(id, display_name, province, country), invoice_lines(amount, tax_rate_id, item_id)')
      .in('kind', ['invoice', 'credit_note']).not('status', 'in', '(draft,void)')
      .gte('issue_date', p.start).lte('issue_date', p.end).order('issue_date').order('number').range(from, to));
  return rows.map((d) => {
    const fx = num(d.fx_rate);
    const sign = (d.kind === 'credit_note' ? -1 : 1) as 1 | -1;
    const sub = num(d.subtotal);
    const discountShare = sub ? num(d.discount) / sub : 0;
    const client = d.clients as unknown as { id: string; display_name: string; province: string | null; country: string } | null;
    const lines = (d.invoice_lines ?? []).map((l) => {
      const rate = l.tax_rate_id ? ref.rateById.get(l.tax_rate_id) : undefined;
      const catId = l.item_id ? itemCat.get(l.item_id) : null;
      const cat = catId ? ref.catById.get(catId) : undefined;
      const amount = num(l.amount) * (1 - discountShare);
      return {
        amountCad: sign * amount * fx,
        taxCad: sign * r2(num(l.amount) * num(rate?.rate)) * fx,
        code: rate?.code ?? 'NONE', rateKind: rate?.kind ?? 'none', rate: num(rate?.rate), taxProvince: rate?.province ?? null,
        category: cat?.name ?? null, gifi: cat?.gifi_code ?? '8000',
      };
    });
    return {
      id: d.id, number: d.number, kind: d.kind as 'invoice' | 'credit_note', status: d.status, issue_date: d.issue_date, due_date: d.due_date,
      currency: d.currency, fx, sign, client: { id: client?.id ?? d.client_id, name: client?.display_name ?? 'Client', province: client?.province ?? null, country: client?.country ?? 'CA' },
      netCad: sign * (sub - num(d.discount)) * fx, taxCad: sign * num(d.tax_total) * fx, totalCad: sign * num(d.total) * fx,
      total: num(d.total), balance: num(d.balance), lines,
    };
  });
});

// ───────────────────────── Expenses ─────────────────────────

export type Expense = View<'expense_overview'> & {
  id: string; spent_on: string; vendor: string;
  /** Business share of the total, CAD (what the company bore). */
  businessCad: number;
  /** Book expense = business share less the recoverable ITC. */
  bookCad: number;
  /** Tax-deductible part of the book expense (meals at 50%). */
  deductibleCad: number;
  gstPaidCad: number; itc: number; deductiblePct: number; ccaClass: string | null; personalCad: number;
};

export function loadExpenses(p: { start: string; end: string }) { return _loadExpenses(p.start, p.end); }
const _loadExpenses = cache(async (start: string, end: string): Promise<Expense[]> => {
  const p = { start, end };
  const supabase = await db();
  const ref = await referenceData();
  const rows = await fetchAll((from, to) =>
    supabase.from('expense_overview').select('*').gte('spent_on', p.start).lte('spent_on', p.end).order('spent_on').order('id').range(from, to));
  return rows.map((e) => {
    const cat = e.category_id ? ref.catById.get(e.category_id) : undefined;
    const pct = num(e.effective_business_pct);
    const businessCad = r2(num(e.total_cad) * pct / 100);
    const itc = num(e.itc_cad);
    const bookCad = r2(businessCad - itc);
    const deductiblePct = num(cat?.deductible_pct ?? 100);
    return {
      ...e, id: e.id!, spent_on: e.spent_on!, vendor: e.vendor ?? '',
      businessCad, bookCad, deductibleCad: r2(bookCad * deductiblePct / 100), gstPaidCad: r2(num(e.gst_hst) * num(e.fx_rate)), itc,
      deductiblePct, ccaClass: cat?.cca_class ?? null, personalCad: r2(num(e.total_cad) - businessCad),
    };
  });
});

// ───────────────────────── Other income, mileage, transfers ─────────────────────────

export function loadOtherIncome(p: { start: string; end: string }) { return _loadOtherIncome(p.start, p.end); }
const _loadOtherIncome = cache(async (start: string, end: string) => {
  const p = { start, end };
  const supabase = await db();
  const ref = await referenceData();
  const rows = must(await supabase.from('other_income').select('*').gte('received_on', p.start).lte('received_on', p.end).order('received_on'));
  return rows.map((o) => {
    const cat = o.category_id ? ref.catById.get(o.category_id) : undefined;
    return { ...o, amountCad: r2(num(o.amount) * num(o.fx_rate)), gstCad: r2(num(o.gst_hst) * num(o.fx_rate)), category: cat?.name ?? 'Other income', gifi: cat?.gifi_code ?? '8230' };
  });
});

export function loadMileage(p: { start: string; end: string }) { return _loadMileage(p.start, p.end); }
const _loadMileage = cache(async (start: string, end: string) => {
  const p = { start, end };
  const supabase = await db();
  const rows = must(await supabase.from('mileage_trips').select('*').gte('trip_on', p.start).lte('trip_on', p.end).order('trip_on'));
  return rows.map((t) => ({ ...t, amountCad: r2(num(t.km) * num(t.rate_per_km)) }));
});

export function loadTransfers(p: { start: string; end: string }) { return _loadTransfers(p.start, p.end); }
const _loadTransfers = cache(async (start: string, end: string) => {
  const p = { start, end };
  const supabase = await db();
  return must(await supabase.from('member_transfers').select('*').gte('occurred_on', p.start).lte('occurred_on', p.end).order('occurred_on'));
});

// ───────────────────────── Balances as at a date ─────────────────────────

/** Owner (shareholder) balances at a date. Positive = the company owes the member. */
export async function memberBalancesAt(asOf: string) {
  const supabase = await db();
  const ref = await referenceData();
  const ledger = await fetchAll((from, to) => supabase.from('member_ledger').select('member_id, amount, occurred_on, repay_by, entry_type, kind').lte('occurred_on', asOf).order('occurred_on').range(from, to));
  return ref.members.map((m) => {
    const rows = ledger.filter((l) => l.member_id === m.id);
    const balance = r2(rows.reduce((s, l) => s + num(l.amount), 0));
    const owedToCompany = r2(-rows.filter((l) => num(l.amount) < 0 && l.entry_type === 'expense').reduce((s, l) => s + num(l.amount), 0));
    return { member: m, balance, entries: rows.length, owedToCompany };
  });
}

export type ArInvoice = { id: string; number: string; client: string; issue_date: string; due_date: string | null; currency: string; balance: number; balanceCad: number; daysOverdue: number; bucket: AgingBucket };
export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'current', label: 'Current' }, { key: '1-30', label: '1–30 days' }, { key: '31-60', label: '31–60 days' }, { key: '61-90', label: '61–90 days' }, { key: '90+', label: '90+ days' },
];

/** Receivables as at a date: issued invoices dated on/before it, less payments received on/before it. */
export async function receivablesAt(asOf: string) {
  const supabase = await db();
  const invoices = await fetchAll((from, to) => supabase.from('invoice_overview')
    .select('id, number, client_name, issue_date, due_date, currency, fx_rate, total, status')
    .eq('kind', 'invoice').not('status', 'in', '(draft,void)').lte('issue_date', asOf).order('issue_date').range(from, to));
  const allocs = await fetchAll((from, to) => supabase.from('payment_allocations').select('invoice_id, amount, payments!inner(received_on)').lte('payments.received_on', asOf).range(from, to));
  const paid = new Map<string, number>();
  for (const a of allocs) paid.set(a.invoice_id, (paid.get(a.invoice_id) ?? 0) + num(a.amount));
  const asOfMs = new Date(asOf + 'T12:00:00').getTime();
  const open: ArInvoice[] = [];
  for (const i of invoices) {
    const balance = r2(num(i.total) - (paid.get(i.id!) ?? 0));
    if (balance <= 0.004) continue;
    const due = i.due_date ?? i.issue_date!;
    const daysOverdue = Math.max(0, Math.round((asOfMs - new Date(due + 'T12:00:00').getTime()) / 864e5));
    const bucket: AgingBucket = daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? '1-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+';
    open.push({ id: i.id!, number: i.number!, client: i.client_name ?? '', issue_date: i.issue_date!, due_date: i.due_date, currency: i.currency!, balance, balanceCad: r2(balance * num(i.fx_rate)), daysOverdue, bucket });
  }
  const buckets = AGING_BUCKETS.map((b) => {
    const items = open.filter((o) => o.bucket === b.key);
    return { ...b, items, total: r2(items.reduce((s, o) => s + o.balanceCad, 0)) };
  });
  return { asOf, open, buckets, total: r2(open.reduce((s, o) => s + o.balanceCad, 0)) };
}

/** Rate to CAD on or before a date (Bank of Canada series stored in fx_rates). */
export async function rateOn(currency: string, on: string) {
  if (currency === 'CAD') return 1;
  const supabase = await db();
  const before = must(await supabase.from('fx_rates').select('rate_to_cad, rate_date').eq('currency', currency).lte('rate_date', on).order('rate_date', { ascending: false }).limit(1).maybeSingle());
  if (before) return num(before.rate_to_cad);
  const after = must(await supabase.from('fx_rates').select('rate_to_cad').eq('currency', currency).order('rate_date').limit(1).maybeSingle());
  return num(after?.rate_to_cad) || 1.4;
}

/** Bank / card balances at a date from the imported feed's running balance. */
export async function accountBalancesAt(asOf: string) {
  const supabase = await db();
  const ref = await referenceData();
  const out = [];
  for (const a of ref.accounts) {
    if (a.kind === 'personal') continue;
    const last = must(await supabase.from('bank_transactions').select('balance_after, posted_on').eq('account_id', a.id).lte('posted_on', asOf)
      .order('posted_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle());
    const balance = r2(num(a.opening_balance) + num(last?.balance_after));
    const rate = await rateOn(a.currency, asOf);
    out.push({ account: a, balance, rate, balanceCad: r2(balance * rate), asOf: last?.posted_on ?? null });
  }
  return out;
}

// ───────────────────────── Monthly helpers ─────────────────────────

export function bucketByMonth<T>(p: { start: string; end: string }, items: T[], date: (t: T) => string, value: (t: T) => number) {
  const months = monthsOf(p);
  const map = new Map(months.map((m) => [m.key, 0]));
  for (const it of items) {
    const k = date(it).slice(0, 7);
    if (map.has(k)) map.set(k, map.get(k)! + value(it));
  }
  return months.map((m) => ({ ...m, value: r2(map.get(m.key)!) }));
}

export type Member = Row<'members'>;
export type MoneyAccount = Row<'money_accounts'>;
