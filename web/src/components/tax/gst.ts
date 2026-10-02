import 'server-only';
import { round2 } from '@/lib/format';
import { loadExpenses, loadOtherIncome, loadSales, type Expense, type SalesDoc } from './books';
import { ITC_TIERS, QUICK_METHOD, INSTALMENT_THRESHOLD, itcTier } from './rules';

const r2 = round2;

export type Worksheet = { l104?: number; l107?: number; l110?: number; l111?: number; l205?: number; l405?: number };

export type RateGroup = {
  key: string; label: string; detail: string; code: string; rate: number; zero: boolean;
  sales: number; tax: number; docs: { id: string; number: string; client: string; date: string; kind: string; net: number; tax: number }[];
};

export type GstResult = Awaited<ReturnType<typeof gstReturn>>;

/**
 * GST/HST return (GST34) for a period, regular method by default.
 * Accrual basis: tax is reported in the period the invoice is issued and
 * ITCs in the period the expense is incurred.
 */
export async function gstReturn(p: { start: string; end: string }, opts: { worksheet?: Worksheet; excludeForeign?: boolean; quick?: boolean } = {}) {
  const [sales, expenses, other] = await Promise.all([loadSales(p), loadExpenses(p), loadOtherIncome(p)]);
  const ws = opts.worksheet ?? {};

  // ── Sales by rate / province ──
  const groups = new Map<string, RateGroup>();
  for (const d of sales) {
    for (const l of d.lines) {
      const key = l.code === 'GST' ? `GST:${d.client.province ?? d.client.country}` : l.code;
      const g = groups.get(key) ?? {
        key, code: l.code, rate: l.rate, zero: l.rateKind === 'zero' || l.rateKind === 'exempt' || l.rateKind === 'none',
        label: rateLabel(l.code, l.rate, l.rateKind), detail: groupDetail(l.code, d, l.taxProvince),
        sales: 0, tax: 0, docs: [],
      };
      g.sales += l.amountCad; g.tax += l.taxCad;
      const row = g.docs.find((x) => x.id === d.id);
      if (row) { row.net += l.amountCad; row.tax += l.taxCad; } else g.docs.push({ id: d.id, number: d.number, client: d.client.name, date: d.issue_date, kind: d.kind, net: l.amountCad, tax: l.taxCad });
      groups.set(key, g);
    }
  }
  const byRate = [...groups.values()].map((g) => ({ ...g, sales: r2(g.sales), tax: r2(g.tax), docs: g.docs.map((x) => ({ ...x, net: r2(x.net), tax: r2(x.tax) })) }))
    .sort((a, b) => Number(a.zero) - Number(b.zero) || b.sales - a.sales);

  const creditNotes = sales.filter((d) => d.kind === 'credit_note');
  const invoiceSales = r2(sales.filter((d) => d.kind === 'invoice').reduce((s, d) => s + d.netCad, 0));
  const invoiceTax = r2(sales.filter((d) => d.kind === 'invoice').reduce((s, d) => s + d.taxCad, 0));
  const cnSales = r2(creditNotes.reduce((s, d) => s + d.netCad, 0));
  const cnTax = r2(creditNotes.reduce((s, d) => s + d.taxCad, 0));
  const otherRevenue = r2(other.reduce((s, o) => s + o.amountCad, 0));
  const otherTax = r2(other.reduce((s, o) => s + o.gstCad, 0));
  const zeroRated = r2(byRate.filter((g) => g.zero).reduce((s, g) => s + g.sales, 0));

  // ── ITCs ──
  const foreign = expenses.filter((e) => e.currency !== 'CAD' && e.itc > 0);
  const claimable = (e: Expense) => !(opts.excludeForeign && e.currency !== 'CAD' && e.itc > 0);
  const itcRows = expenses.filter((e) => e.itc > 0 && claimable(e));
  const itcByCat = new Map<string, { name: string; count: number; gstPaid: number; itc: number; ids: string[] }>();
  for (const e of expenses.filter((x) => num(x.gst_hst) > 0)) {
    const name = e.category_name ?? 'Uncategorised';
    const g = itcByCat.get(name) ?? { name, count: 0, gstPaid: 0, itc: 0, ids: [] };
    g.count++; g.gstPaid += e.gstPaidCad; g.itc += claimable(e) ? e.itc : 0; g.ids.push(e.id);
    itcByCat.set(name, g);
  }
  const itcCategories = [...itcByCat.values()].map((g) => ({ ...g, gstPaid: r2(g.gstPaid), itc: r2(g.itc) })).sort((a, b) => b.itc - a.itc);
  const itcTotal = r2(itcRows.reduce((s, e) => s + e.itc, 0));

  // ── Regular-method lines ──
  const n = (v: number | undefined) => r2(Number(v ?? 0) || 0);
  const l101 = r2(invoiceSales + cnSales + otherRevenue);
  const l103 = r2(invoiceTax + cnTax + otherTax);
  const l104 = n(ws.l104);
  const l105 = r2(l103 + l104);
  const l106 = itcTotal;
  const l107 = n(ws.l107);
  const l108 = r2(l106 + l107);
  const l109 = r2(l105 - l108);
  const l110 = n(ws.l110);
  const l111 = n(ws.l111);
  const l112 = r2(l110 + l111);
  const l113A = r2(l109 - l112);
  const l205 = n(ws.l205);
  const l405 = n(ws.l405);
  const l113B = r2(l205 + l405);
  const l113C = r2(l113A + l113B);

  // ── Quick method (only shown when the profile opts in) ──
  const quickBase = byRate.filter((g) => !g.zero).map((g) => {
    const rate = QUICK_METHOD.rates[g.code];
    const withTax = r2(g.sales + g.tax);
    return { key: g.key, label: g.label, detail: g.detail, withTax, remit: rate ?? null, amount: rate == null ? null : r2(withTax * rate) };
  });
  const quickEligible = r2(quickBase.reduce((s, b) => s + b.withTax, 0));
  const quickCredit = r2(Math.min(quickEligible, QUICK_METHOD.creditBase) * QUICK_METHOD.creditRate);
  const quickCollected = r2(quickBase.reduce((s, b) => s + (b.amount ?? 0), 0));
  const capitalItcs = r2(expenses.filter((e) => e.is_capital && claimable(e)).reduce((s, e) => s + e.itc, 0));
  const ql101 = quickEligible;
  const ql103 = quickCollected;
  const ql105 = r2(ql103 + l104);
  const ql106 = capitalItcs;
  const ql107 = r2(quickCredit + l107);
  const ql108 = r2(ql106 + ql107);
  const ql109 = r2(ql105 - ql108);
  const quick = {
    base: quickBase, eligible: quickEligible, collected: quickCollected, credit: quickCredit, capitalItcs,
    lines: { l101: ql101, l103: ql103, l104, l105: ql105, l106: ql106, l107: ql107, l108: ql108, l109: ql109, l110, l111, l112, l113A: r2(ql109 - l112), l205, l405, l113B, l113C: r2(ql109 - l112 + l113B) },
    /** What the regular method would give, for comparison. */
    saving: r2(l109 - ql109),
    unsupported: quickBase.filter((b) => b.remit == null).map((b) => b.label),
  };

  // ── Compliance flags ──
  const noReceipt = expenses.filter((e) => e.itc > 0 && !num(e.attachment_count));
  const tiers = ITC_TIERS.map((t) => {
    const items = expenses.filter((e) => e.itc > 0 && itcTier(num(e.total_cad)) === t.key);
    return { ...t, count: items.length, missing: items.filter((e) => !num(e.attachment_count)), itc: r2(items.reduce((s, e) => s + e.itc, 0)) };
  });
  const meals = expenses.filter((e) => e.deductiblePct < 100 && num(e.gst_hst) > 0);
  const personalTax = expenses.filter((e) => e.nature === 'personal' && num(e.gst_hst) > 0);
  const salesFlags = sales.flatMap((d) => {
    const out: { doc: SalesDoc; issue: string }[] = [];
    const foreignClient = d.client.country !== 'CA';
    if (foreignClient && d.lines.some((l) => l.taxCad !== 0)) out.push({ doc: d, issue: 'GST/HST charged to a client outside Canada — exports of services are usually zero-rated.' });
    if (!foreignClient && d.lines.some((l) => l.rateKind === 'zero')) out.push({ doc: d, issue: 'Zero-rated line on an invoice to a Canadian client.' });
    if (!foreignClient && d.client.province) {
      const wrong = d.lines.find((l) => l.taxProvince && l.taxProvince !== d.client.province);
      if (wrong) out.push({ doc: d, issue: `HST for ${wrong.taxProvince} on an invoice to a ${d.client.province} client — check the place of supply.` });
      if (HST_PROVINCES.includes(d.client.province) && d.lines.some((l) => l.code === 'GST')) out.push({ doc: d, issue: `GST 5% charged to a client in ${d.client.province}, an HST province.` });
    }
    return out;
  });

  return {
    period: p,
    sales, expenses, other, byRate, creditNotes, itcCategories, itcRows,
    totals: { invoiceSales, invoiceTax, cnSales, cnTax, otherRevenue, otherTax, zeroRated, itcTotal, foreignItc: r2(foreign.reduce((s, e) => s + e.itc, 0)) },
    lines: { l101, l103, l104, l105, l106, l107, l108, l109, l110, l111, l112, l113A, l205, l405, l113B, l113C },
    quick,
    flags: { noReceipt, tiers, foreign, meals, personalTax, salesFlags },
    instalmentsRequired: l109 >= INSTALMENT_THRESHOLD,
  };
}

const HST_PROVINCES = ['ON', 'NS', 'NB', 'NL', 'PE'];
const num = (v: unknown) => Number(v ?? 0);

function rateLabel(code: string, rate: number, kind: string) {
  if (kind === 'zero') return 'Zero-rated';
  if (kind === 'exempt') return 'Exempt';
  if (code === 'NONE') return 'No tax code';
  return `${kind === 'hst' ? 'HST' : 'GST'} ${r2(rate * 100)}%`;
}
function groupDetail(code: string, d: SalesDoc, prov: string | null) {
  if (code === 'GST') return d.client.province ? `Clients in ${d.client.province}` : 'Canada';
  if (code === 'ZERO') return d.client.country === 'CA' ? 'Zero-rated supplies' : 'Exports (clients outside Canada)';
  if (prov) return `Clients in ${prov}`;
  return '';
}
