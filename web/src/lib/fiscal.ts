import { format } from 'date-fns';

/**
 * Fiscal-year helpers. Year-end is stored as "MM-DD" (Tech Nerv: "09-30").
 * A fiscal year is named for the calendar year it ends in: FY2026 = Oct 1 2025 – Sep 30 2026.
 */
export function fiscalYearOf(d: Date | string, yearEnd = '09-30') {
  const v = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
  const [m, day] = yearEnd.split('-').map(Number);
  // Compare calendar days, not instants: the year-end date itself belongs to the year it closes.
  const endThisYear = new Date(v.getFullYear(), m! - 1, day!, 23, 59, 59, 999);
  return v > endThisYear ? v.getFullYear() + 1 : v.getFullYear();
}

export function fiscalRange(fy: number, yearEnd = '09-30') {
  const [m, day] = yearEnd.split('-').map(Number);
  const end = new Date(fy, m! - 1, day!);
  const start = new Date(fy - 1, m! - 1, day! + 1);
  return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd'), label: `FY${fy}` };
}

export function fiscalLabel(fy: number, yearEnd = '09-30') {
  const r = fiscalRange(fy, yearEnd);
  return `FY${fy} · ${format(new Date(r.start + 'T12:00:00'), 'MMM yyyy')} – ${format(new Date(r.end + 'T12:00:00'), 'MMM yyyy')}`;
}
