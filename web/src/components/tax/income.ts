import 'server-only';
import { round2 } from '@/lib/format';
import { loadExpenses, loadMileage, loadOtherIncome, loadSales, referenceData, type Expense } from './books';
import { GIFI_NAMES, ccaFirstYear, CCA_RATES, SMALL_BUSINESS_RATE_BC } from './rules';
import { fyOfDate, type Period } from './period';

const r2 = round2;

export type GifiLine = { gifi: string; label: string; amount: number; parts: { name: string; amount: number; count: number }[] };

/**
 * Income statement for a period, grouped by GIFI code (Schedule 125).
 *  · Revenue: invoice lines (net of GST/HST, credit notes negative) by the item's income category; other income by its category.
 *  · Expenses: business share of each non-capital expense less its ITC, by the category's GIFI code; owner mileage allowance at 9281.
 *  · Capital purchases are excluded (they go to CCA / Schedule 8).
 */
export async function incomeStatement(p: { start: string; end: string }) {
  const [sales, expenses, other, trips] = await Promise.all([loadSales(p), loadExpenses(p), loadOtherIncome(p), loadMileage(p)]);

  const rev = new Map<string, Map<string, { amount: number; count: number }>>();
  const add = (m: typeof rev, gifi: string, name: string, v: number) => {
    const g = m.get(gifi) ?? new Map();
    const x = g.get(name) ?? { amount: 0, count: 0 };
    x.amount += v; x.count++;
    g.set(name, x); m.set(gifi, g);
  };
  for (const d of sales) for (const l of d.lines) add(rev, l.gifi || '8000', l.category ?? 'Sales', l.amountCad);
  for (const o of other) add(rev, o.gifi, o.category, o.amountCad);

  const exp = new Map<string, Map<string, { amount: number; count: number }>>();
  const operating = expenses.filter((e) => !e.is_capital && e.bookCad !== 0);
  for (const e of operating) add(exp, e.gifi_code ?? '9270', e.category_name ?? 'Uncategorised', e.bookCad);
  const mileage = r2(trips.reduce((s, t) => s + t.amountCad, 0));
  if (mileage) {
    const g = exp.get('9281') ?? new Map();
    g.set('Mileage allowance (owners)', { amount: mileage, count: trips.length });
    exp.set('9281', g);
  }

  const toLines = (m: typeof rev): GifiLine[] => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([gifi, parts]) => {
    const list = [...parts.entries()].map(([name, v]) => ({ name, amount: r2(v.amount), count: v.count })).sort((a, b) => b.amount - a.amount);
    return { gifi, label: GIFI_NAMES[gifi] ?? `GIFI ${gifi}`, amount: r2(list.reduce((s, x) => s + x.amount, 0)), parts: list };
  });
  const revenue = toLines(rev);
  const expenseLines = toLines(exp);
  const totalRevenue = r2(revenue.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = r2(expenseLines.reduce((s, l) => s + l.amount, 0));
  const netIncome = r2(totalRevenue - totalExpenses);

  // Schedule 1 style add-backs
  const mealsRows = operating.filter((e) => e.deductiblePct < 100);
  const mealsBook = r2(mealsRows.reduce((s, e) => s + e.bookCad, 0));
  const mealsAddBack = r2(mealsRows.reduce((s, e) => s + (e.bookCad - e.deductibleCad), 0));
  const personalExcluded = r2(expenses.reduce((s, e) => s + e.personalCad, 0));
  const personalRows = expenses.filter((e) => e.personalCad > 0);

  return {
    period: p, revenue, expenses: expenseLines, totalRevenue, totalExpenses, netIncome,
    mealsBook, mealsAddBack, mealsRows, personalExcluded, personalRows, mileage, trips,
    capitalRows: expenses.filter((e) => e.is_capital), operating,
  };
}

export type CapitalAsset = { id: string; spent_on: string; vendor: string; description: string | null; category: string; ccaClass: string; cost: number; fy: number; attachments: number };
export type CcaClassYear = { ccaClass: string; rate: number; opening: number; additions: number; firstYear: number; rule: string; proposed: string | null; cca: number; closing: number };

/**
 * Capital assets bought up to (and including) the fiscal year, with an
 * estimated CCA schedule per class assuming the maximum claim every year.
 * Estimate only — the accountant decides the actual claim on Schedule 8.
 */
export async function capitalSchedule(fy: number, ctx: { yearEnd: string; filings: { kind: string; period_start: string; period_end: string }[] }, upTo: Period) {
  const ref = await referenceData();
  const all = await loadExpenses({ start: '1900-01-01', end: upTo.end });
  const assets: CapitalAsset[] = all.filter((e) => e.is_capital).map((e: Expense) => ({
    id: e.id, spent_on: e.spent_on, vendor: e.vendor, description: e.description, category: e.category_name ?? '',
    ccaClass: e.ccaClass ?? ref.cats.find((c) => c.id === e.category_id)?.cca_class ?? '?',
    // Capital cost = business share, net of the ITC claimed on it.
    cost: e.bookCad, fy: fyOfDate(e.spent_on, ctx.yearEnd, ctx.filings), attachments: Number(e.attachment_count ?? 0),
  }));
  const classes = [...new Set(assets.map((a) => a.ccaClass))].sort();
  const firstFy = Math.min(fy, ...assets.map((a) => a.fy));
  const byYear = new Map<number, CcaClassYear[]>();
  const ucc = new Map<string, number>(classes.map((c) => [c, 0]));
  for (let y = firstFy; y <= fy; y++) {
    const rows: CcaClassYear[] = [];
    for (const c of classes) {
      const rate = CCA_RATES[c] ?? 0;
      const adds = assets.filter((a) => a.ccaClass === c && a.fy === y);
      const additions = r2(adds.reduce((s, a) => s + a.cost, 0));
      const opening = ucc.get(c) ?? 0;
      // First-year treatment is decided per asset by its available-for-use date (approximated by purchase date).
      const firstYear = r2(adds.reduce((s, a) => s + a.cost * ccaFirstYear(a.spent_on, c).share, 0));
      const rules = [...new Set(adds.map((a) => ccaFirstYear(a.spent_on, c).label))];
      const proposed = [...new Set(adds.map((a) => ccaFirstYear(a.spent_on, c).proposed).filter(Boolean))][0] ?? null;
      const cca = r2(Math.min(opening + additions, opening * rate + firstYear));
      const closing = r2(opening + additions - cca);
      ucc.set(c, closing);
      if (opening || additions) rows.push({ ccaClass: c, rate, opening: r2(opening), additions, firstYear, rule: rules.join(' · ') || 'No additions', proposed, cca, closing });
    }
    byYear.set(y, rows);
  }
  const current = byYear.get(fy) ?? [];
  return { assets, thisYear: assets.filter((a) => a.fy === fy), schedule: current, byYear, totalCca: r2(current.reduce((s, r) => s + r.cca, 0)) };
}

/** Rough taxable income and Part I tax at the combined BC small-business rate. Estimate only. */
export function taxEstimate(netIncome: number, addBacks: number, cca: number) {
  const taxable = r2(Math.max(0, netIncome + addBacks - cca));
  return { taxable, rate: SMALL_BUSINESS_RATE_BC, tax: r2(taxable * SMALL_BUSINESS_RATE_BC) };
}
