import { addMonths, addWeeks, addYears, format, parseISO } from 'date-fns';
import type { InvoiceKind, PaymentMethod, Row, View } from '@/lib/types';
import { daysUntil, money, num, shortDate } from '@/lib/format';
import type { Tone } from '@/components/ui/badge';

export type InvoiceRow = View<'invoice_overview'>;
export type TaxRate = Pick<Row<'tax_rates'>, 'id' | 'code' | 'name' | 'rate' | 'kind' | 'province'>;

export const KIND_LABEL: Record<InvoiceKind, string> = { invoice: 'Invoice', estimate: 'Estimate', credit_note: 'Credit note' };

/** Status wording differs a little per document kind. */
export function statusLabel(kind: InvoiceKind | string | null, status: string, overdue?: boolean): { label: string; tone: Tone } {
  if (overdue) return { label: 'Overdue', tone: 'red' };
  if (kind === 'credit_note') {
    if (status === 'sent') return { label: 'Issued', tone: 'blue' };
    if (status === 'paid') return { label: 'Applied', tone: 'accent' };
  }
  const map: Record<string, { label: string; tone: Tone }> = {
    draft: { label: 'Draft', tone: 'gray' },
    sent: { label: 'Sent', tone: 'blue' },
    partial: { label: 'Partly paid', tone: 'orange' },
    paid: { label: 'Paid', tone: 'accent' },
    void: { label: 'Void', tone: 'gray' },
    accepted: { label: 'Accepted', tone: 'accent' },
    declined: { label: 'Declined', tone: 'red' },
  };
  return map[status] ?? { label: status, tone: 'gray' };
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'etransfer', label: 'e-Transfer' },
  { value: 'eft', label: 'EFT' },
  { value: 'wire', label: 'Wire' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Other' },
];
export const methodLabel = (m: string | null | undefined) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m ?? '';

/** Human due / validity line for list rows and the detail hero. */
export function dueInfo(inv: { kind: string | null; status: string | null; due_date: string | null; last_payment_on: string | null; issue_date: string | null }): { text: string; tone: 'red' | 'orange' | 'muted' | 'accent' } {
  const status = inv.status ?? 'draft';
  if (inv.kind === 'estimate') {
    if (status === 'accepted') return { text: 'Accepted', tone: 'accent' };
    if (status === 'declined') return { text: 'Declined', tone: 'muted' };
    if (!inv.due_date) return { text: '', tone: 'muted' };
    const d = daysUntil(inv.due_date);
    if (d < 0) return { text: `Expired ${shortDate(inv.due_date)}`, tone: 'orange' };
    if (d === 0) return { text: 'Valid until today', tone: 'orange' };
    return { text: `Valid until ${shortDate(inv.due_date)}`, tone: d <= 5 ? 'orange' : 'muted' };
  }
  if (inv.kind === 'credit_note') return { text: inv.status === 'draft' ? 'Draft' : `Issued ${shortDate(inv.issue_date)}`, tone: 'muted' };
  if (status === 'paid') return { text: inv.last_payment_on ? `Paid ${shortDate(inv.last_payment_on)}` : 'Paid', tone: 'accent' };
  if (status === 'void') return { text: 'Void', tone: 'muted' };
  if (!inv.due_date) return { text: '', tone: 'muted' };
  const d = daysUntil(inv.due_date);
  const prefix = status === 'draft' ? 'Draft · ' : '';
  if (d < 0) return { text: `${prefix}${-d} ${-d === 1 ? 'day' : 'days'} overdue`, tone: status === 'draft' ? 'muted' : 'red' };
  if (d === 0) return { text: `${prefix}Due today`, tone: 'orange' };
  if (d === 1) return { text: `${prefix}Due tomorrow`, tone: 'orange' };
  return { text: `${prefix}Due in ${d} days`, tone: d <= 3 && status !== 'draft' ? 'orange' : 'muted' };
}

export const toneClass = { red: 'text-red', orange: 'text-orange', muted: 'text-label-3', accent: 'text-accent-text' } as const;

/** Stable tint per client for the leading tile. */
const TINTS = ['#05A38C', '#0680A2', '#7C4DDB', '#E8833A', '#D9467A', '#5E7CE2', '#03BB90', '#C2410C', '#0E7490', '#6B7B80'];
export function clientColor(id: string | null | undefined) {
  let h = 0;
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/** "GST 5%", "HST 13% (ON)", "Zero-rated — export of services". */
export function taxLabel(t: Pick<TaxRate, 'kind' | 'rate' | 'province' | 'name'> | null | undefined, opts: { gstNumber?: string | null } = {}) {
  if (!t) return 'No tax';
  const pct = `${+(num(t.rate) * 100).toFixed(3)}%`;
  switch (t.kind) {
    case 'gst': return `GST ${pct}${opts.gstNumber ? ` (BN ${opts.gstNumber})` : ''}`;
    case 'hst': return `HST ${pct}${t.province ? ` (${t.province})` : ''}`;
    case 'pst': return `PST ${pct}${t.province ? ` (${t.province})` : ''}`;
    case 'zero': return 'Zero-rated — export of services';
    case 'exempt': return 'Exempt';
    default: return t.name;
  }
}

/** Short treatment line for client pickers: "GST 5% · BC", "Zero-rated · USD". */
export function treatmentLabel(c: { province?: string | null; country?: string | null; currency?: string | null }, t?: TaxRate | null) {
  const where = c.country && c.country !== 'CA' ? c.country : c.province ?? 'CA';
  const tax = !t ? 'No default tax' : t.kind === 'zero' ? 'Zero-rated' : t.kind === 'exempt' ? 'Exempt' : `${t.kind.toUpperCase()} ${+(num(t.rate) * 100).toFixed(3)}%`;
  return [tax, where, c.currency && c.currency !== 'CAD' ? c.currency : null].filter(Boolean).join(' · ');
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineLike = { quantity: number | string | null; unit_price: number | string | null; tax_rate_id: string | null };
export type TaxGroup = { id: string | null; label: string; rate: number; base: number; amount: number; kind: string };

/**
 * Mirrors accounts.recalc_invoice: the discount is spread pro rata before tax,
 * tax is rounded per line, and grouped by rate for display.
 * Pass `taxTotal` (from the DB) to absorb any 1¢ float drift into the largest group.
 */
export function computeTotals(lines: LineLike[], rates: TaxRate[], discountIn: number | string | null, opts: { gstNumber?: string | null; taxTotal?: number | string | null } = {}) {
  const byId = new Map(rates.map((r) => [r.id, r]));
  const amounts = lines.map((l) => r2(num(l.quantity) * num(l.unit_price)));
  const subtotal = r2(amounts.reduce((s, a) => s + a, 0));
  const discount = Math.min(Math.max(num(discountIn), 0), Math.max(subtotal, 0));
  const factor = subtotal > 0 ? 1 - discount / subtotal : 1;
  const groups = new Map<string, TaxGroup>();
  lines.forEach((l, i) => {
    const t = l.tax_rate_id ? byId.get(l.tax_rate_id) : undefined;
    const key = t?.id ?? 'none';
    const g = groups.get(key) ?? { id: t?.id ?? null, label: taxLabel(t, opts), rate: num(t?.rate), base: 0, amount: 0, kind: t?.kind ?? 'none' };
    g.base = r2(g.base + amounts[i]! * factor);
    g.amount = r2(g.amount + r2(amounts[i]! * factor * num(t?.rate)));
    groups.set(key, g);
  });
  const taxes = [...groups.values()].filter((g) => g.kind !== 'none').sort((a, b) => b.rate - a.rate);
  let taxTotal = r2(taxes.reduce((s, g) => s + g.amount, 0));
  if (opts.taxTotal !== undefined && opts.taxTotal !== null) {
    const drift = r2(num(opts.taxTotal) - taxTotal);
    if (drift !== 0 && Math.abs(drift) <= 0.05 && taxes.length) {
      const big = taxes.reduce((a, b) => (b.amount > a.amount ? b : a));
      big.amount = r2(big.amount + drift);
      taxTotal = r2(taxTotal + drift);
    }
  }
  return { amounts, subtotal, discount, taxes, taxTotal, total: r2(subtotal - discount + taxTotal) };
}

/** Replace month names (and their year) in text with the target month: "Retainer — October 2026" → "… November 2026". */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function bumpMonthNames(text: string | null, target: Date) {
  if (!text) return text;
  const name = MONTHS[target.getMonth()]!;
  const year = String(target.getFullYear());
  return text
    .replace(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'g'), `${name} ${year}`)
    .replace(new RegExp(`\\b(${MONTHS.join('|')})\\b(?!\\s+\\d{4})`, 'g'), name);
}

export function nextRun(fromIso: string, frequency: string) {
  const d = parseISO(fromIso);
  const n = frequency === 'weekly' ? addWeeks(d, 1) : frequency === 'quarterly' ? addMonths(d, 3) : frequency === 'yearly' ? addYears(d, 1) : addMonths(d, 1);
  return format(n, 'yyyy-MM-dd');
}

export const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export function monthKey(iso: string | null | undefined) { return (iso ?? '').slice(0, 7); }
export function monthHeader(key: string) { return key ? format(parseISO(key + '-01'), 'MMMM yyyy') : ''; }

/** Money with the currency spelled out when it isn't CAD. */
export function moneyCur(n: number | string | null | undefined, currency = 'CAD') {
  return currency === 'CAD' ? money(n) : `${money(n, currency)} ${currency}`;
}

export function docHref(inv: { id: string | null }) { return `/invoices/${inv.id}`; }

let keySeq = 0;
/** Stable React keys for editor lines (works on server and client). */
export const newKey = () => `l${Date.now().toString(36)}${(keySeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
