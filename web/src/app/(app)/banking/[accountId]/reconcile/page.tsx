import { notFound } from 'next/navigation';
import { endOfMonth, format, parseISO } from 'date-fns';
import { Page } from '@/components/ui/page';
import { ReconcileView, type MonthInfo } from '@/components/banking/reconcile-view';
import { db, must } from '@/lib/db';
import { allMembers } from '@/lib/session';
import { isoToday, num, round2 } from '@/lib/format';
import { closingBalance } from '../../_lib/data';

export const metadata = { title: 'Reconcile' };

export default async function ReconcilePage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ accountId }, sp, supabase, members] = await Promise.all([params, searchParams, db(), allMembers()]);
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) notFound();
  const account = must(await supabase.from('money_accounts').select('*').eq('id', accountId).maybeSingle());
  if (!account || !['bank', 'credit_card'].includes(account.kind)) notFound();

  const [txnRes, recRes] = await Promise.all([
    supabase.from('bank_transactions').select('id, posted_on, description, amount, balance_after, status, created_at').eq('account_id', accountId).order('posted_on').order('created_at').limit(5000),
    supabase.from('reconciliations').select('*').eq('account_id', accountId).order('period_end', { ascending: false }),
  ]);
  const txns = must(txnRes).map((t) => ({ ...t, amount: num(t.amount), balance_after: t.balance_after === null ? null : num(t.balance_after) }));
  const recs = must(recRes);
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.full_name]));
  const opening = num(account.opening_balance);

  // Every month from the first transaction to this month, newest first.
  const months: MonthInfo[] = [];
  if (txns.length) {
    const first = txns[0]!.posted_on.slice(0, 7);
    let cursor = isoToday().slice(0, 7);
    while (cursor >= first) {
      const end = format(endOfMonth(parseISO(cursor + '-01')), 'yyyy-MM-dd');
      const inMonth = txns.filter((t) => t.posted_on.slice(0, 7) === cursor);
      const before = txns.filter((t) => t.posted_on < cursor + '-01');
      const rec = recs.find((r) => r.period_end === end);
      const bank = closingBalance(txns.filter((t) => t.posted_on <= end));
      months.push({
        month: cursor, periodEnd: end, ended: end < isoToday(),
        opening: round2(opening + before.reduce((s, t) => s + t.amount, 0)),
        computed: round2(opening + before.reduce((s, t) => s + t.amount, 0) + inMonth.reduce((s, t) => s + t.amount, 0)),
        bankBalance: bank === null ? null : round2(opening + bank),
        moneyIn: round2(inMonth.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
        moneyOut: round2(inMonth.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
        unreviewed: inMonth.filter((t) => t.status === 'unreviewed').length,
        txns: inMonth.map((t) => ({ id: t.id, postedOn: t.posted_on, description: t.description, amount: t.amount, status: t.status })).reverse(),
        reconciliation: rec ? {
          id: rec.id, statement: num(rec.statement_balance), computed: num(rec.computed_balance), notes: rec.notes,
          by: rec.reconciled_by ? nameOf[rec.reconciled_by] ?? null : null, at: rec.reconciled_at,
        } : null,
      });
      const [y, m] = cursor.split('-').map(Number);
      cursor = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, '0')}`;
    }
  }
  const wanted = months.find((m) => m.month === sp.month)
    ?? months.find((m) => m.ended && !m.reconciliation) ?? months[0] ?? null;

  return (
    <Page title="Reconcile" subtitle={account.name} back={{ href: `/banking/${accountId}`, label: account.name.replace(/^EQ Bank /, 'EQ ') }}>
      <ReconcileView
        key={wanted?.month ?? 'none'}
        accountId={accountId} accountKind={account.kind} currency={account.currency}
        months={months} selected={wanted?.month ?? null}
      />
    </Page>
  );
}
