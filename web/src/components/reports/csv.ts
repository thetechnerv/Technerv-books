/** Minimal RFC 4180 CSV writer. Numbers are written plainly (no $ or thousands separators). */
export type Cell = string | number | boolean | null | undefined;

function cell(v: Cell) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  // Neutralise spreadsheet formula injection from free-text fields.
  const s = /^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]) {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

/** UTF-8 BOM so Excel opens accented names correctly. */
export const BOM = '﻿';

export function csvResponse(name: string, csv: string) {
  return new Response(BOM + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w.\-]+/g, '-')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
