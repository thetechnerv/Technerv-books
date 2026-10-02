import 'server-only';
import { db, must } from '@/lib/db';
import { num } from '@/lib/format';
import type { InvoiceKind } from '@/lib/types';
import type { ListRow } from './doc-list';
import type { LastDoc } from './list-toolbar';

/** All documents of the given kinds, shaped for the list. */
export async function listDocs(kinds: InvoiceKind[]): Promise<ListRow[]> {
  const supabase = await db();
  const [rows, derived] = await Promise.all([
    supabase.from('invoice_overview')
      .select('id, number, kind, status, client_id, client_name, title, issue_date, due_date, total, balance, currency, is_overdue, days_overdue, last_payment_on, fx_rate, converted_from')
      .in('kind', kinds).order('issue_date', { ascending: false }).order('number', { ascending: false }),
    kinds.includes('estimate')
      ? supabase.from('invoices').select('id, number, converted_from').eq('kind', 'invoice').not('converted_from', 'is', null)
      : Promise.resolve({ data: [] as { id: string; number: string; converted_from: string | null }[], error: null }),
  ]);
  const conv = new Map(must(derived).map((d) => [d.converted_from!, d]));
  return must(rows).map((r) => ({
    id: r.id!, number: r.number!, kind: r.kind!, status: r.status!, client_id: r.client_id!, client_name: r.client_name ?? '',
    title: r.title, issue_date: r.issue_date!, due_date: r.due_date, total: num(r.total), balance: num(r.balance), currency: r.currency ?? 'CAD',
    is_overdue: !!r.is_overdue, days_overdue: num(r.days_overdue), last_payment_on: r.last_payment_on,
    fx_rate: num(r.fx_rate) || 1,
    converted_to: conv.get(r.id!)?.number ?? null, converted_to_id: conv.get(r.id!)?.id ?? null,
  }));
}

/** Most recent invoice per client, for "Duplicate last invoice". */
export function lastByClient(rows: (ListRow & { fx_rate?: number })[]): LastDoc[] {
  const seen = new Map<string, LastDoc>();
  for (const r of rows) {
    if (r.kind !== 'invoice' || r.status === 'void' || seen.has(r.client_id)) continue;
    seen.set(r.client_id, { client_id: r.client_id, client_name: r.client_name, id: r.id, number: r.number, title: r.title, total: r.total, currency: r.currency, issue_date: r.issue_date });
  }
  return [...seen.values()].sort((a, b) => a.client_name.localeCompare(b.client_name));
}

export function matches(r: ListRow, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return r.number.toLowerCase().includes(s) || r.client_name.toLowerCase().includes(s) || (r.title ?? '').toLowerCase().includes(s);
}
