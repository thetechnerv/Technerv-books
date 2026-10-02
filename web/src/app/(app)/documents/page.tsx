import { Vault, type VaultDoc } from '@/components/documents/vault';
import { statementCoverage } from '@/components/documents/statements';
import { taxContext, periodFor, referenceData } from '@/components/tax/books';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';

export const metadata = { title: 'Documents' };

type SP = { fy?: string; type?: string; q?: string; id?: string; doc?: string };

export default async function Documents({ searchParams }: { searchParams: Promise<SP> }) {
  await currentMember();
  const sp = await searchParams;
  const [ctx, ref, supabase] = await Promise.all([taxContext(), referenceData(), db()]);
  const fyNum = Number(sp.fy);
  const trackerFy = ctx.years.includes(fyNum) ? fyNum : ctx.defaultFy;
  const [docs, files, coverage] = await Promise.all([
    supabase.from('documents').select('*').order('issued_on', { ascending: false, nullsFirst: false }),
    supabase.from('attachments').select('id, entity_id, file_name, mime_type, size_bytes, original_size_bytes, compression, created_at').eq('entity_type', 'document').order('created_at'),
    statementCoverage(periodFor(ctx, trackerFy)),
  ]);
  const byDoc = new Map<string, VaultDoc['files']>();
  for (const f of must(files)) byDoc.set(f.entity_id, [...(byDoc.get(f.entity_id) ?? []), f]);
  const list: VaultDoc[] = must(docs).map((d) => ({
    id: d.id, title: d.title, doc_type: d.doc_type, fiscal_year: d.fiscal_year, issued_on: d.issued_on, expires_on: d.expires_on, notes: d.notes,
    account_id: d.account_id, period_start: d.period_start, period_end: d.period_end, created_at: d.created_at, files: byDoc.get(d.id) ?? [],
  }));
  // Years: every fiscal year in the books plus any year a document is filed under.
  const years = [...new Set([...ctx.years, ...list.map((d) => d.fiscal_year).filter((y): y is number => !!y)])].sort((a, b) => b - a);
  const accounts = ref.accounts.filter((a) => (a.kind === 'bank' || a.kind === 'credit_card') && !a.archived).map((a) => ({ id: a.id, name: a.name, kind: a.kind, last4: a.last4 }));
  const openId = sp.id ?? sp.doc ?? null;

  return (
    <Vault
      docs={list}
      accounts={accounts}
      years={years}
      trackerFy={trackerFy}
      coverage={{ rows: coverage.rows, have: coverage.have, expected: coverage.expected, months: coverage.months }}
      initial={{ q: sp.q ?? '', type: sp.type ?? '', fy: sp.fy && (years.includes(fyNum) || sp.fy === 'none') ? sp.fy : '', id: openId && list.some((d) => d.id === openId) ? openId : null }}
    />
  );
}
