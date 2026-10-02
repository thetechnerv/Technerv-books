import 'server-only';
import { db, must } from '@/lib/db';
import { monthsOf } from '@/components/tax/period';
import { referenceData } from '@/components/tax/books';

export type StatementCell = { month: string; label: string; long: string; start: string; end: string; docs: { id: string; title: string; files: number }[] };
export type StatementRow = { account: { id: string; name: string; kind: string; currency: string; last4: string | null }; cells: StatementCell[]; have: number };

/**
 * For each bank / card account and each month of the period: is there a
 * statement in Documents (type "statement") covering that month?
 * A statement covers the months its period touches; without a period, the
 * month it was issued in.
 */
export async function statementCoverage(p: { start: string; end: string }) {
  const supabase = await db();
  const ref = await referenceData();
  const months = monthsOf(p);
  const accounts = ref.accounts.filter((a) => (a.kind === 'bank' || a.kind === 'credit_card') && !a.archived);
  const [docs, files] = await Promise.all([
    supabase.from('documents').select('id, title, account_id, period_start, period_end, issued_on').eq('doc_type', 'statement'),
    supabase.from('attachments').select('entity_id').eq('entity_type', 'document'),
  ]);
  const fileCount = new Map<string, number>();
  for (const f of must(files)) fileCount.set(f.entity_id, (fileCount.get(f.entity_id) ?? 0) + 1);
  const statements = must(docs);
  const rows: StatementRow[] = accounts.map((a) => {
    const mine = statements.filter((d) => d.account_id === a.id);
    const cells = months.map((m) => ({
      month: m.key, label: m.label, long: m.long, start: m.start, end: m.end,
      docs: mine.filter((d) => {
        const s = d.period_start ?? d.issued_on, e = d.period_end ?? d.issued_on;
        return !!s && !!e && s <= m.end && e >= m.start;
      }).map((d) => ({ id: d.id, title: d.title, files: fileCount.get(d.id) ?? 0 })),
    }));
    return { account: { id: a.id, name: a.name, kind: a.kind, currency: a.currency, last4: a.last4 }, cells, have: cells.filter((c) => c.docs.length).length };
  });
  const unassigned = statements.filter((d) => !d.account_id).length;
  const expected = rows.length * months.length;
  const have = rows.reduce((s, r) => s + r.have, 0);
  return { rows, months, expected, have, missing: expected - have, unassigned };
}
