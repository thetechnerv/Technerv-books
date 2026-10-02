import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isoToday } from '@/lib/format';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * GET /api/settings/export — a .zip with one CSV per table in the `accounts`
 * schema (members only). Tables come from accounts.export_tables(), so tables
 * added by later migrations are included automatically.
 */
export async function GET() {
  const me = await currentMember();
  const supabase = await db();
  const { data: list, error } = await supabase.rpc('export_tables');
  if (error) return new NextResponse(`Couldn’t list tables: ${error.message}`, { status: 500 });
  const tables = (list as unknown as (string | { export_tables: string })[]).map((t) => (typeof t === 'string' ? t : t.export_tables));

  const zip = new JSZip();
  const summary: string[] = [];
  for (const table of tables) {
    const rows = await readAll(supabase, table);
    zip.file(`${table}.csv`, toCsv(rows));
    summary.push(`${table}.csv  ${rows.length} rows`);
  }
  zip.file('README.txt', [
    'Tech Nerv Accounts — full export',
    `Exported ${new Date().toISOString()} by ${me.full_name} <${me.email}>`,
    '',
    'One CSV per table in the "accounts" schema. Amounts are in the record’s own currency unless the column ends in _cad.',
    'Dates are ISO (YYYY-MM-DD); timestamps are UTC. Arrays and JSON columns are written as JSON text.',
    'Attached files (receipts, PDFs) are not included — download them from the app.',
    '',
    ...summary,
    '',
  ].join('\n'));

  const body = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="technerv-accounts-export-${isoToday()}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function readAll(supabase: Awaited<ReturnType<typeof db>>, table: string) {
  const rows: Record<string, Json>[] = [];
  let ordered = true;
  for (let from = 0; ; from += 1000) {
    const q = supabase.from(table as 'invoices').select('*').range(from, from + 999);
    let res = ordered ? await q.order('id' as never) : await q;
    if (res.error && ordered) {
      // Tables without an `id` column (e.g. fx_rates) are read in natural order.
      ordered = false;
      res = await supabase.from(table as 'invoices').select('*').range(from, from + 999);
    }
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    const page = (res.data ?? []) as unknown as Record<string, Json>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function toCsv(rows: Record<string, Json>[]) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(cell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c] ?? null)).join(','));
  // BOM so Excel opens UTF-8 (accents, em dashes) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function cell(v: Json): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formulas in text (but keep negative numbers).
  if (typeof v === 'string' && /^[=+@\t\r]|^-(?![\d.])/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
