import 'server-only';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { db, must } from '@/lib/db';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { num, round2 } from '@/lib/format';
import type { Row, View } from '@/lib/types';

export const DOC_COLS =
  'id, kind, number, title, status, client_id, project_id, project_name, issue_date, due_date, currency, fx_rate, subtotal, discount, tax_total, total, amount_paid, balance, is_overdue, days_overdue, last_payment_on, converted_from';
export type Doc = Pick<View<'invoice_overview'>,
  'id' | 'kind' | 'number' | 'title' | 'status' | 'client_id' | 'project_id' | 'project_name' | 'issue_date' | 'due_date' | 'currency' | 'fx_rate' |
  'subtotal' | 'discount' | 'tax_total' | 'total' | 'amount_paid' | 'balance' | 'is_overdue' | 'days_overdue' | 'last_payment_on' | 'converted_from'>;

export const PAYMENT_COLS = 'id, client_id, received_on, amount, currency, fx_rate, method, reference, notes';
export type Payment = Pick<Row<'payments'>, 'id' | 'client_id' | 'received_on' | 'amount' | 'currency' | 'fx_rate' | 'method' | 'reference' | 'notes'>;

export type ClientStats = {
  openCount: number; open: number; openCad: number;
  overdueCount: number; overdue: number; overdueCad: number;
  billed: number; billedCad: number;
  billedFy: number; billedFyCad: number;
  invoiceCount: number;
  lastInvoiceOn: string | null; lastInvoiceId: string | null;
  avgDaysToPay: number | null; paidCount: number;
  lastPaymentOn: string | null; lastPaymentAmount: number | null;
  openEstimates: number;
};

export type ClientSummary = Row<'clients'> & { stats: ClientStats; taxCode: string | null };

/** Right after year-end the useful "this year" is the one that just closed (matches Home). */
export function reportingFy(yearEnd: string, today = new Date()) {
  const fyNow = fiscalYearOf(today, yearEnd);
  const start = parseISO(fiscalRange(fyNow, yearEnd).start);
  const fy = differenceInCalendarDays(today, start) < 100 ? fyNow - 1 : fyNow;
  return { fy, ...fiscalRange(fy, yearEnd) };
}

const issued = (d: Doc) => d.status !== 'draft' && d.status !== 'void';

export function summarize(docs: Doc[], payments: Payment[], fy: { start: string; end: string }): ClientStats {
  const s: ClientStats = {
    openCount: 0, open: 0, openCad: 0, overdueCount: 0, overdue: 0, overdueCad: 0, billed: 0, billedCad: 0, billedFy: 0, billedFyCad: 0,
    invoiceCount: 0, lastInvoiceOn: null, lastInvoiceId: null, avgDaysToPay: null, paidCount: 0, lastPaymentOn: null, lastPaymentAmount: null, openEstimates: 0,
  };
  let daysSum = 0;
  let lastAny: Doc | null = null;
  for (const d of docs) {
    const fx = num(d.fx_rate) || 1;
    if (d.kind === 'estimate') {
      if (d.status === 'sent' || d.status === 'draft') s.openEstimates++;
      continue;
    }
    if (d.kind === 'invoice' && d.status !== 'void' && (!lastAny || (d.issue_date ?? '') > (lastAny.issue_date ?? ''))) lastAny = d;
    if (!issued(d)) continue;
    const sign = d.kind === 'credit_note' ? -1 : 1;
    const total = num(d.total) * sign;
    s.billed += total; s.billedCad += total * fx;
    if (d.issue_date! >= fy.start && d.issue_date! <= fy.end) { s.billedFy += total; s.billedFyCad += total * fx; }
    if (d.kind !== 'invoice') continue;
    s.invoiceCount++;
    if (!s.lastInvoiceOn || d.issue_date! > s.lastInvoiceOn) s.lastInvoiceOn = d.issue_date!;
    if (d.status === 'sent' || d.status === 'partial') {
      const bal = num(d.balance);
      s.openCount++; s.open += bal; s.openCad += bal * fx;
      if (d.is_overdue) { s.overdueCount++; s.overdue += bal; s.overdueCad += bal * fx; }
    }
    if (d.status === 'paid' && d.last_payment_on && d.issue_date) {
      daysSum += Math.max(0, differenceInCalendarDays(parseISO(d.last_payment_on), parseISO(d.issue_date)));
      s.paidCount++;
    }
  }
  s.lastInvoiceId = lastAny?.id ?? null;
  if (s.paidCount) s.avgDaysToPay = Math.round(daysSum / s.paidCount);
  for (const p of payments) {
    if (!s.lastPaymentOn || p.received_on > s.lastPaymentOn) { s.lastPaymentOn = p.received_on; s.lastPaymentAmount = num(p.amount); }
  }
  for (const k of ['open', 'openCad', 'overdue', 'overdueCad', 'billed', 'billedCad', 'billedFy', 'billedFyCad'] as const) s[k] = round2(s[k]);
  return s;
}

/** Every client with its receivables / billing stats. Small data set, so one pass in memory. */
export async function loadClientSummaries(yearEnd: string) {
  const supabase = await db();
  const fy = reportingFy(yearEnd);
  const [clients, docs, payments, rates] = await Promise.all([
    supabase.from('clients').select('*').order('display_name'),
    supabase.from('invoice_overview').select(DOC_COLS),
    supabase.from('payments').select(PAYMENT_COLS),
    supabase.from('tax_rates').select('id, code'),
  ]);
  const byClient = groupBy(must(docs) as Doc[], (d) => d.client_id ?? '');
  const payByClient = groupBy(must(payments) as Payment[], (p) => p.client_id ?? '');
  const codeById = new Map(must(rates).map((r) => [r.id, r.code]));
  const list: ClientSummary[] = must(clients).map((c) => ({
    ...c,
    taxCode: c.default_tax_rate_id ? codeById.get(c.default_tax_rate_id) ?? null : null,
    stats: summarize(byClient.get(c.id) ?? [], payByClient.get(c.id) ?? [], fy),
  }));
  return { clients: list, fy };
}

export function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x); else m.set(k, [x]);
  }
  return m;
}

export async function activeTaxRates() {
  const supabase = await db();
  return must(await supabase.from('tax_rates').select('id, code, name, rate, kind').eq('active', true).order('rate'));
}
export type TaxRateLite = Awaited<ReturnType<typeof activeTaxRates>>[number];

// ───────────────────────── Client detail ─────────────────────────

export type ProjectStats = { billed: number; revenueCad: number; costCad: number; expenseCount: number; unbilledCount: number; unbilledCad: number; invoiceCount: number };
export type ProjectWithStats = Row<'projects'> & { stats: ProjectStats };

/** Pre-tax amount a document contributes to project revenue (credit notes subtract). */
export const preTax = (d: Pick<Doc, 'kind' | 'subtotal' | 'discount'>) => (d.kind === 'credit_note' ? -1 : 1) * (num(d.subtotal) - num(d.discount));

/** What an expense really cost the business: business share, less the GST/HST we claim back. */
export const expenseCost = (e: { total_cad: number | null; effective_business_pct: number | null; itc_cad: number | null }) =>
  round2(num(e.total_cad) * num(e.effective_business_pct) / 100 - num(e.itc_cad));

export function projectStats(docs: Doc[], expenses: { total_cad: number | null; effective_business_pct: number | null; itc_cad: number | null; billable: boolean | null; billed_invoice_id: string | null }[]): ProjectStats {
  const billedDocs = docs.filter((d) => d.kind !== 'estimate' && issued(d));
  const unbilled = expenses.filter((e) => e.billable && !e.billed_invoice_id);
  return {
    billed: round2(billedDocs.reduce((s, d) => s + preTax(d), 0)),
    revenueCad: round2(billedDocs.reduce((s, d) => s + preTax(d) * (num(d.fx_rate) || 1), 0)),
    costCad: round2(expenses.reduce((s, e) => s + expenseCost(e), 0)),
    expenseCount: expenses.length,
    unbilledCount: unbilled.length,
    unbilledCad: round2(unbilled.reduce((s, e) => s + num(e.total_cad), 0)),
    invoiceCount: billedDocs.filter((d) => d.kind === 'invoice').length,
  };
}

export async function loadClientDetail(id: string, yearEnd: string) {
  const supabase = await db();
  const fy = reportingFy(yearEnd);
  const client = must(await supabase.from('clients').select('*').eq('id', id).maybeSingle());
  if (!client) return null;
  const [docsRes, paysRes, projectsRes, rateRes, namesRes] = await Promise.all([
    supabase.from('invoice_overview').select(DOC_COLS).eq('client_id', id).order('issue_date', { ascending: false }).order('number', { ascending: false }),
    supabase.from('payments').select(`${PAYMENT_COLS}, payment_allocations(amount, invoice_id, invoices(number))`).eq('client_id', id).order('received_on', { ascending: false }),
    supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    client.default_tax_rate_id ? supabase.from('tax_rates').select('code, name').eq('id', client.default_tax_rate_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('clients').select('id, display_name'),
  ]);
  const docs = must(docsRes) as Doc[];
  const payments = must(paysRes);
  const projects = must(projectsRes);
  const projectIds = projects.map((p) => p.id);
  const exps = projectIds.length
    ? must(await supabase.from('expense_overview').select('project_id, total_cad, effective_business_pct, itc_cad, billable, billed_invoice_id').in('project_id', projectIds))
    : [];
  const docsByProject = groupBy(docs, (d) => d.project_id ?? '');
  const expByProject = groupBy(exps, (e) => e.project_id ?? '');
  const projectsWithStats: ProjectWithStats[] = projects.map((p) => ({ ...p, stats: projectStats(docsByProject.get(p.id) ?? [], expByProject.get(p.id) ?? []) }));
  // Sort: active → lead → paused → done, then newest
  const order = { active: 0, lead: 1, paused: 2, done: 3 } as Record<string, number>;
  projectsWithStats.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.started_on ?? '').localeCompare(a.started_on ?? ''));
  return {
    client,
    docs,
    payments,
    projects: projectsWithStats,
    stats: summarize(docs, payments as Payment[], fy),
    taxRate: (rateRes as { data: { code: string; name: string } | null }).data,
    others: must(namesRes).map((n) => ({ id: n.id, name: n.display_name })),
    fy,
  };
}
export type ClientDetail = NonNullable<Awaited<ReturnType<typeof loadClientDetail>>>;
