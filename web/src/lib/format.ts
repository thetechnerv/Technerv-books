import { format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';

const formatters = new Map<string, Intl.NumberFormat>();
function nf(currency: string, compact = false, cents = true) {
  const key = `${currency}:${compact}:${cents}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency,
      currencyDisplay: currency === 'CAD' ? 'narrowSymbol' : 'symbol',
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : cents ? 2 : 0,
      maximumFractionDigits: compact ? 1 : cents ? 2 : 0,
    }));
  }
  return formatters.get(key)!;
}

/** $1,234.56 (CAD) or US$1,234.56 */
export function money(n: number | string | null | undefined, currency = 'CAD', opts: { compact?: boolean; cents?: boolean; sign?: boolean } = {}) {
  const v = Number(n ?? 0);
  const s = nf(currency, opts.compact, opts.cents ?? true).format(Math.abs(v));
  if (v < 0) return `−${s}`;
  if (opts.sign && v > 0) return `+${s}`;
  return s;
}

export const num = (n: number | string | null | undefined) => Number(n ?? 0);
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function toDate(d: string | Date) { return typeof d === 'string' ? parseISO(d) : d; }
export function date(d: string | Date | null | undefined, pattern = 'MMM d, yyyy') {
  if (!d) return '';
  const v = toDate(d);
  return isValid(v) ? format(v, pattern) : '';
}
export const shortDate = (d: string | Date | null | undefined) => date(d, 'MMM d');
export const isoToday = () => format(new Date(), 'yyyy-MM-dd');

/** "Today", "Yesterday", "Mon", "Sep 21", "Sep 21, 2025" */
export function relativeDay(d: string | Date | null | undefined) {
  if (!d) return '';
  const v = toDate(d);
  const diff = differenceInCalendarDays(new Date(), v);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return format(v, 'EEEE');
  if (v.getFullYear() === new Date().getFullYear()) return format(v, 'MMM d');
  return format(v, 'MMM d, yyyy');
}

export function daysUntil(d: string | Date) { return differenceInCalendarDays(toDate(d), new Date()); }

export function pct(n: number | string | null | undefined, digits = 0) { return `${Number(n ?? 0).toFixed(digits)}%`; }

export function plural(n: number, one: string, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function bytes(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(v < 10240 ? 1 : 0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}
