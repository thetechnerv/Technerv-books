import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { fiscalRange } from '@/lib/fiscal';

/** A reporting window. Dates are inclusive ISO strings (yyyy-MM-dd). */
export type Period = { start: string; end: string; label: string; fy: number | null };

export type FilingSpan = { kind: string; period_start: string; period_end: string };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Fiscal year (named for the year it ends in) of an ISO date or Date, compared
 * as strings so the year-end day itself stays in its own year.
 * (lib/fiscal's fiscalYearOf parses strings at noon, which pushes the
 * year-end day into the next year.)
 */
export function fyOf(d: string | Date, yearEnd = '09-30') {
  const s = typeof d === 'string' ? d.slice(0, 10) : iso(d);
  const y = Number(s.slice(0, 4));
  return s.slice(5) <= yearEnd ? y : y + 1;
}
const at = (s: string) => parseISO(s);

/**
 * The fiscal year as it was actually filed. A first year that started at
 * incorporation (e.g. Aug 15 2024 → Sep 30 2025) is longer than the generic
 * Oct–Sep window, so a GST/T2 filing ending on the year-end wins.
 */
export function fyPeriod(fy: number, yearEnd: string, filings: FilingSpan[] = []): Period {
  const r = fiscalRange(fy, yearEnd);
  const filed = filings.filter((f) => (f.kind === 'gst' || f.kind === 't2') && f.period_end === r.end).map((f) => f.period_start).sort()[0];
  const start = filed && filed < r.start ? filed : r.start;
  return { start, end: r.end, label: `FY${fy}`, fy };
}

/** Fiscal year a date belongs to, honouring an extended first year. */
export function fyOfDate(d: string, yearEnd: string, filings: FilingSpan[] = []) {
  const hit = filings.find((f) => (f.kind === 'gst' || f.kind === 't2') && f.period_start <= d && f.period_end >= d);
  return fyOf(hit ? hit.period_end : d, yearEnd);
}

/** Right after year-end the useful year is the one that just closed (≈100 days). */
export function defaultFiscalYear(yearEnd: string, today = new Date()) {
  const fyNow = fyOf(today, yearEnd);
  const start = at(fiscalRange(fyNow, yearEnd).start);
  return differenceInCalendarDays(today, start) < 100 ? fyNow - 1 : fyNow;
}

/** Calendar months touched by a period, as { key: 'yyyy-MM', start, end, label }. */
export function monthsOf(p: { start: string; end: string }) {
  const out: { key: string; start: string; end: string; label: string; long: string }[] = [];
  let m = startOfMonth(at(p.start));
  const last = at(p.end);
  while (m <= last) {
    out.push({ key: format(m, 'yyyy-MM'), start: iso(m), end: iso(endOfMonth(m)), label: format(m, 'MMM'), long: format(m, 'MMMM yyyy') });
    m = addMonths(m, 1);
  }
  return out;
}

/** Statement months for a fiscal year: always the 12 months ending at year-end (a stub year adds its extra months). */
export function statementMonths(p: Period) {
  return monthsOf(p);
}

export function isIsoDate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(at(s).getTime());
}

export function addDaysIso(d: string, n: number) { return iso(addDays(at(d), n)); }
export function addMonthsIso(d: string, n: number) { return iso(addMonths(at(d), n)); }
export function endOfMonthIso(d: string) { return iso(endOfMonth(at(d))); }

/**
 * Reads the period from search params: ?fy=2026, or ?from=…&to=… (custom).
 * Falls back to the default fiscal year.
 */
export function resolvePeriod(
  sp: { fy?: string; from?: string; to?: string },
  opts: { yearEnd: string; filings: FilingSpan[]; years: number[]; defaultFy: number },
): Period & { custom: boolean } {
  if (isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from <= sp.to) {
    return { start: sp.from, end: sp.to, label: `${format(at(sp.from), 'MMM d, yyyy')} – ${format(at(sp.to), 'MMM d, yyyy')}`, fy: null, custom: true };
  }
  const n = Number(sp.fy);
  const fy = Number.isInteger(n) && opts.years.includes(n) ? n : opts.defaultFy;
  return { ...fyPeriod(fy, opts.yearEnd, opts.filings), custom: false };
}

/** Human label: "FY2026 · Oct 1, 2025 – Sep 30, 2026". */
export function periodLong(p: Period) {
  const range = `${format(at(p.start), 'MMM d, yyyy')} – ${format(at(p.end), 'MMM d, yyyy')}`;
  return p.fy ? `FY${p.fy} · ${range}` : range;
}
