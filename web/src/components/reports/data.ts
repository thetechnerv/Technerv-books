import 'server-only';
import { db } from '@/lib/db';
import { round2 } from '@/lib/format';
import { fetchAll, loadExpenses, loadMileage, loadOtherIncome, loadSales, rateOn, referenceData, receivablesAt } from '@/components/tax/books';
import { monthsOf } from '@/components/tax/period';

const r2 = round2;

export type PnlRow = { key: string; name: string; gifi: string | null; months: number[]; total: number; parts?: PnlRow[] };

/**
 * Profit & loss by month on the accrual basis: revenue = invoice lines net of
 * GST/HST (credit notes negative) + other income; expenses = business share of
 * each non-capital expense less its ITC, plus the owners' mileage allowance.
 */
export async function profitAndLoss(p: { start: string; end: string }) {
  const months = monthsOf(p);
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const [sales, expenses, other, trips] = await Promise.all([loadSales(p), loadExpenses(p), loadOtherIncome(p), loadMileage(p)]);
  const zero = () => months.map(() => 0);

  type Acc = { name: string; gifi: string | null; months: number[]; parts: Map<string, { name: string; months: number[] }> };
  const add = (map: Map<string, Acc>, key: string, gifi: string | null, part: string, date: string, v: number) => {
    const i = idx.get(date.slice(0, 7));
    if (i === undefined) return;
    const a = map.get(key) ?? { name: key, gifi, months: zero(), parts: new Map() };
    a.months[i]! += v;
    const pt = a.parts.get(part) ?? { name: part, months: zero() };
    pt.months[i]! += v;
    a.parts.set(part, pt);
    map.set(key, a);
  };

  const rev = new Map<string, Acc>();
  for (const d of sales) for (const l of d.lines) add(rev, l.category ?? 'Sales', l.gifi, d.client.name, d.issue_date, l.amountCad);
  for (const o of other) add(rev, o.category, o.gifi, o.source, o.received_on, o.amountCad);

  const exp = new Map<string, Acc>();
  for (const e of expenses) if (!e.is_capital && e.bookCad) add(exp, e.category_name ?? 'Uncategorised', e.gifi_code ?? null, e.vendor, e.spent_on, e.bookCad);
  for (const t of trips) add(exp, 'Mileage allowance (owners)', '9281', t.purpose, t.trip_on, t.amountCad);

  const finish = (map: Map<string, Acc>): PnlRow[] => [...map.values()].map((a) => {
    const parts = [...a.parts.values()].map((x) => ({ key: x.name, name: x.name, gifi: null, months: x.months.map(r2), total: r2(x.months.reduce((s, v) => s + v, 0)) }))
      .sort((x, y) => y.total - x.total);
    return { key: a.name, name: a.name, gifi: a.gifi, months: a.months.map(r2), total: r2(a.months.reduce((s, v) => s + v, 0)), parts };
  }).sort((x, y) => y.total - x.total);

  const revenue = finish(rev);
  const expense = finish(exp);
  const sumRows = (rows: PnlRow[]) => months.map((_, i) => r2(rows.reduce((s, r) => s + r.months[i]!, 0)));
  const revenueMonths = sumRows(revenue);
  const expenseMonths = sumRows(expense);
  const netMonths = revenueMonths.map((v, i) => r2(v - expenseMonths[i]!));
  const totalRevenue = r2(revenueMonths.reduce((s, v) => s + v, 0));
  const totalExpenses = r2(expenseMonths.reduce((s, v) => s + v, 0));
  const capital = r2(expenses.filter((e) => e.is_capital).reduce((s, e) => s + e.bookCad, 0));
  return { months, revenue, expense, revenueMonths, expenseMonths, netMonths, totalRevenue, totalExpenses, net: r2(totalRevenue - totalExpenses), capital };
}

/** Business spending by category (book basis), with mileage and a capital line kept separate. */
export async function expensesByCategory(p: { start: string; end: string }) {
  const pl = await profitAndLoss(p);
  const rows = pl.expense.map((r) => ({ name: r.name, gifi: r.gifi, amount: r.total, count: r.parts?.length ?? 0, vendors: r.parts ?? [] }));
  return { rows, total: pl.totalExpenses, capital: pl.capital, months: pl.months };
}

/** Who spent and from which account. Gross amounts (what left the card or pocket), split business / personal. */
export async function spending(p: { start: string; end: string }) {
  const [expenses, ref] = await Promise.all([loadExpenses(p), referenceData()]);
  const owners = ref.members.map((m) => {
    const mine = expenses.filter((e) => e.spent_by === m.id);
    const business = r2(mine.reduce((s, e) => s + e.businessCad, 0));
    const personal = r2(mine.reduce((s, e) => s + e.personalCad, 0));
    const outOfPocket = r2(mine.filter((e) => e.paid_from_kind === 'personal').reduce((s, e) => s + e.businessCad, 0));
    return { id: m.id, name: m.full_name, color: m.color, initials: m.initials, business, personal, total: r2(business + personal), count: mine.length, outOfPocket };
  }).filter((o) => o.count);
  const accounts = ref.accounts.map((a) => {
    const mine = expenses.filter((e) => e.paid_from_account_id === a.id);
    return { id: a.id, name: a.name, kind: a.kind, total: r2(mine.reduce((s, e) => s + Number(e.total_cad ?? 0), 0)), business: r2(mine.reduce((s, e) => s + e.businessCad, 0)), count: mine.length };
  }).filter((a) => a.count).sort((a, b) => b.total - a.total);
  return { owners, accounts, total: r2(accounts.reduce((s, a) => s + a.total, 0)), expenses };
}

/** Net sales per client (before tax, credit notes netted) and what's still open today. */
export async function revenueByClient(p: { start: string; end: string }) {
  const sales = await loadSales(p);
  const map = new Map<string, { id: string; name: string; net: number; tax: number; count: number; open: number; currency: Set<string>; docs: typeof sales }>();
  for (const d of sales) {
    const c = map.get(d.client.id) ?? { id: d.client.id, name: d.client.name, net: 0, tax: 0, count: 0, open: 0, currency: new Set<string>(), docs: [] };
    c.net += d.netCad; c.tax += d.taxCad; c.count++; c.currency.add(d.currency); c.docs.push(d);
    if (d.kind === 'invoice' && ['sent', 'partial'].includes(d.status)) c.open += d.balance * d.fx;
    map.set(d.client.id, c);
  }
  const rows = [...map.values()].map((c) => ({ ...c, net: r2(c.net), tax: r2(c.tax), open: r2(c.open), currency: [...c.currency] })).sort((a, b) => b.net - a.net);
  return { rows, total: r2(rows.reduce((s, r) => s + r.net, 0)) };
}

export const arAging = receivablesAt;

/**
 * Money in vs out per month across business bank and card accounts (CAD).
 * Transfers between your own accounts (e.g. paying the card from the bank)
 * cancel out and are left out: same amount, opposite sign, within 5 days.
 */
export async function cashFlow(p: { start: string; end: string }) {
  const supabase = await db();
  const ref = await referenceData();
  const accounts = ref.accounts.filter((a) => a.kind !== 'personal' && a.is_business);
  const ids = accounts.map((a) => a.id);
  const cur = new Map(accounts.map((a) => [a.id, a.currency]));
  const txns = await fetchAll((f, t) => supabase.from('bank_transactions').select('id, account_id, posted_on, amount, description')
    .in('account_id', ids).gte('posted_on', p.start).lte('posted_on', p.end).order('posted_on').range(f, t));

  // Pair internal transfers.
  const internal = new Set<string>();
  const byAmount = new Map<string, typeof txns>();
  for (const t of txns) { const k = Math.abs(Number(t.amount)).toFixed(2); byAmount.set(k, [...(byAmount.get(k) ?? []), t]); }
  for (const list of byAmount.values()) {
    for (const a of list) {
      if (internal.has(a.id) || Number(a.amount) >= 0) continue;
      const match = list.find((b) => !internal.has(b.id) && b.account_id !== a.account_id && Number(b.amount) > 0 && cur.get(b.account_id) === cur.get(a.account_id)
        && Math.abs(new Date(b.posted_on).getTime() - new Date(a.posted_on).getTime()) <= 5 * 864e5);
      if (match) { internal.add(a.id); internal.add(match.id); }
    }
  }

  const months = monthsOf(p);
  const rates = new Map<string, number>();
  for (const m of months) for (const c of new Set(cur.values())) rates.set(`${c}:${m.key}`, await rateOn(c, m.end));
  const rows = months.map((m) => ({ ...m, in: 0, out: 0, count: 0 }));
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const t of txns) {
    if (internal.has(t.id)) continue;
    const i = idx.get(t.posted_on.slice(0, 7));
    if (i === undefined) continue;
    const v = Number(t.amount) * (rates.get(`${cur.get(t.account_id)}:${rows[i]!.key}`) ?? 1);
    if (v >= 0) rows[i]!.in += v; else rows[i]!.out += -v;
    rows[i]!.count++;
  }
  const out = rows.map((r) => ({ ...r, in: r2(r.in), out: r2(r.out), net: r2(r.in - r.out) }));
  return {
    rows: out, internal: internal.size / 2,
    totalIn: r2(out.reduce((s, r) => s + r.in, 0)), totalOut: r2(out.reduce((s, r) => s + r.out, 0)),
    net: r2(out.reduce((s, r) => s + r.net, 0)), accounts: accounts.map((a) => a.name),
  };
}
