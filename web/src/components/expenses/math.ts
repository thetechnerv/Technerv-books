/**
 * Expense money math, mirrored exactly from the SQL views
 * (`expense_overview.deductible_cad / itc_cad`, `member_balances`, `member_ledger`)
 * so the form can explain the consequence before anything is saved.
 * Pure functions, safe on client and server.
 */
export type Nature = 'business' | 'personal' | 'mixed';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function effectivePct(nature: Nature, businessPct: number) {
  if (nature === 'personal') return 0;
  if (nature === 'business') return 100;
  return Math.min(99, Math.max(1, businessPct));
}

export type Treatment = {
  totalCad: number;
  businessPct: number;
  deductiblePct: number;
  deductible: number;
  itc: number;
  /** Positive: company owes the member. Negative: member owes the company. */
  owed: number;
  personalCad: number;
  businessCad: number;
};

export function treatment(input: {
  total: number; fxRate: number; gstHst: number; nature: Nature; businessPct: number;
  categoryDeductiblePct: number; paidWithBusinessFunds: boolean;
}): Treatment {
  const pct = effectivePct(input.nature, input.businessPct);
  const totalCad = r2(input.total * input.fxRate);
  const ded = input.categoryDeductiblePct ?? 100;
  const deductible = r2(totalCad * pct / 100 * ded / 100);
  const itc = r2(input.gstHst * input.fxRate * pct / 100 * ded / 100);
  const owed = input.paidWithBusinessFunds ? -r2(totalCad * (100 - pct) / 100) : r2(totalCad * pct / 100);
  return { totalCad, businessPct: pct, deductiblePct: ded, deductible, itc, owed, businessCad: r2(totalCad * pct / 100), personalCad: r2(totalCad * (100 - pct) / 100) };
}

const fmt = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }).format(Math.abs(n));

/** One plain-English line that says what saving this expense will do. */
export function consequence(t: Treatment, opts: { memberFirst: string; isCapital: boolean; ccaClass?: string | null }) {
  const who = opts.memberFirst;
  const parts: string[] = [];
  if (t.totalCad <= 0) return 'Enter an amount to see how this is treated.';
  if (t.businessPct === 0) {
    if (t.owed < 0) return `Personal — added to ${who}’s shareholder loan (${fmt(t.owed)} owed to the company), not deductible`;
    return 'Personal, paid personally — kept for the record only, no tax effect';
  }
  if (t.businessPct === 100) parts.push('Business expense');
  else parts.push(`${t.businessPct}% business`);
  if (opts.isCapital) parts.push(`capital asset — claimed through CCA${opts.ccaClass ? ` class ${opts.ccaClass}` : ''}, not expensed`);
  else if (t.businessPct < 100 || t.deductiblePct < 100) parts.push(`${fmt(t.deductible)} deductible${t.deductiblePct < 100 ? ` (${t.deductiblePct}% rule)` : ''}`);
  if (t.itc > 0) parts.push(`${fmt(t.itc)} ITC`);
  if (t.owed > 0) parts.push(`company owes ${who} ${fmt(t.owed)}`);
  if (t.owed < 0) parts.push(`${who} owes the company ${fmt(t.owed)}`);
  return parts.join(' · ');
}

// ───────────── Sales-tax presets (back-calculated from the total) ─────────────
export type TaxPreset = 'bc' | 'gst' | 'hst13' | 'none' | 'custom';
export const TAX_PRESETS: { value: TaxPreset; label: string; short: string }[] = [
  { value: 'bc', label: 'BC goods (GST 5% + PST 7%)', short: 'GST + PST' },
  { value: 'gst', label: 'GST 5%', short: 'GST 5%' },
  { value: 'hst13', label: 'HST 13%', short: 'HST 13%' },
  { value: 'none', label: 'No tax / foreign', short: 'No tax' },
  { value: 'custom', label: 'Custom', short: 'Custom' },
];

export function backCalc(total: number, preset: TaxPreset): { gstHst: number; pst: number } | null {
  if (preset === 'custom') return null;
  if (preset === 'none' || total <= 0) return { gstHst: 0, pst: 0 };
  if (preset === 'gst') return { gstHst: r2(total * 5 / 105), pst: 0 };
  if (preset === 'hst13') return { gstHst: r2(total * 13 / 113), pst: 0 };
  const sub = total / 1.12;
  return { gstHst: r2(sub * 0.05), pst: r2(sub * 0.07) };
}

/** Best guess at which preset produced stored amounts (for editing). */
export function detectPreset(total: number, gstHst: number, pst: number): TaxPreset {
  for (const p of ['none', 'gst', 'hst13', 'bc'] as const) {
    const b = backCalc(total, p)!;
    if (Math.abs(b.gstHst - gstHst) <= 0.02 && Math.abs(b.pst - pst) <= 0.02) return p;
  }
  return 'custom';
}

export const round2 = r2;
