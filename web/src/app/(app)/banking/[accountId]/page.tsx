import { notFound } from 'next/navigation';
import { Scale, Upload, Inbox } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { BigMoney } from '@/components/ui/money';
import { LinkSegmented } from '@/components/ui/segmented';
import { AccountTile } from '@/components/banking/bits';
import { TxnList, type TxnRow } from '@/components/banking/txn-list';
import { SearchBox } from '@/components/banking/search-box';
import { db, must } from '@/lib/db';
import { allMembers } from '@/lib/session';
import { date, num, round2 } from '@/lib/format';
import { closingBalance } from '../_lib/data';

const FILTERS = ['all', 'unreviewed', 'matched', 'ignored'] as const;
type Filter = (typeof FILTERS)[number];

export async function generateMetadata({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return { title: 'Account' };
  const supabase = await db();
  const a = must(await supabase.from('money_accounts').select('name').eq('id', accountId).maybeSingle());
  return { title: a?.name ?? 'Account' };
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<{ filter?: string; q?: string }> }) {
  const [{ accountId }, sp, supabase, members] = await Promise.all([params, searchParams, db(), allMembers()]);
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) notFound();
  const account = must(await supabase.from('money_accounts').select('*').eq('id', accountId).maybeSingle());
  if (!account || !['bank', 'credit_card'].includes(account.kind)) notFound();
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'all';
  const q = (sp.q ?? '').trim().slice(0, 80);

  const [txnRes, exps, pays, incomes, transfers, batches, rules] = await Promise.all([
    supabase.from('bank_transactions').select('*').eq('account_id', accountId).order('posted_on').order('created_at').limit(5000),
    supabase.from('expenses').select('id, vendor, category_id, categories(name)').eq('paid_from_account_id', accountId).not('bank_transaction_id', 'is', null),
    supabase.from('payments').select('id, amount, clients(display_name)').eq('deposit_account_id', accountId),
    supabase.from('other_income').select('id, source, description').eq('account_id', accountId),
    supabase.from('member_transfers').select('id, kind, members(full_name)'),
    supabase.from('import_batches').select('id, file_name').eq('account_id', accountId),
    supabase.from('rules').select('id, vendor_rename, match_text'),
  ]);
  const all = must(txnRes);
  const E = Object.fromEntries(must(exps).map((e) => [e.id, `${e.vendor}${(e.categories as { name: string } | null)?.name ? ` · ${(e.categories as { name: string }).name}` : ''}`]));
  const P = Object.fromEntries(must(pays).map((p) => [p.id, `Payment from ${(p.clients as { display_name: string } | null)?.display_name ?? 'client'}`]));
  const I = Object.fromEntries(must(incomes).map((i) => [i.id, `${i.source}${i.description ? ` · ${i.description}` : ''}`]));
  const T = Object.fromEntries(must(transfers).map((t) => [t.id, `${t.kind[0]!.toUpperCase()}${t.kind.slice(1)} · ${(t.members as { full_name: string } | null)?.full_name ?? 'owner'}`]));
  const B = Object.fromEntries(must(batches).map((b) => [b.id, b.file_name]));
  const R = Object.fromEntries(must(rules).map((r) => [r.id, r.vendor_rename ?? r.match_text]));
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

  // Running balance: the bank's own figure when the statement had one, otherwise worked out.
  const running: number[] = [];
  for (const t of all) running.push(round2((running[running.length - 1] ?? num(account.opening_balance)) + num(t.amount)));
  const rows: TxnRow[] = all.map((t, i) => {
    const link = t.matched_expense_id ? { kind: 'expense' as const, id: t.matched_expense_id, label: E[t.matched_expense_id] ?? 'Expense', href: `/expenses/${t.matched_expense_id}` }
      : t.matched_payment_id ? { kind: 'payment' as const, id: t.matched_payment_id, label: P[t.matched_payment_id] ?? 'Client payment', href: `/payments?id=${t.matched_payment_id}` }
      : t.matched_income_id ? { kind: 'income' as const, id: t.matched_income_id, label: I[t.matched_income_id] ?? 'Income', href: null }
      : t.matched_transfer_id ? { kind: 'transfer' as const, id: t.matched_transfer_id, label: T[t.matched_transfer_id] ?? 'Owner transfer', href: '/balances' }
      : null;
    return {
      id: t.id, postedOn: t.posted_on, description: t.description, amount: num(t.amount),
      balance: t.balance_after !== null ? round2(num(account.opening_balance) + num(t.balance_after)) : running[i]!,
      status: t.status, note: t.note, link, auto: t.auto_matched, rule: t.rule_id ? R[t.rule_id] ?? null : null,
      batch: t.import_batch ? B[t.import_batch] ?? null : null, reviewedBy: t.reviewed_by ? nameOf[t.reviewed_by] ?? null : null, reviewedAt: t.reviewed_at,
    };
  }).reverse();

  const count = (f: Filter) => rows.filter((r) => match(r, f)).length;
  const qn = q.toUpperCase();
  const visible = rows.filter((r) => match(r, filter) && (!qn || r.description.toUpperCase().includes(qn) || (r.link?.label.toUpperCase().includes(qn) ?? false) || String(Math.abs(r.amount)).includes(q)));
  const bal = closingBalance(all.map((t) => ({ posted_on: t.posted_on, amount: num(t.amount), balance_after: t.balance_after === null ? null : num(t.balance_after), created_at: t.created_at })));
  const balance = round2(num(account.opening_balance) + (bal ?? 0));
  const card = account.kind === 'credit_card';
  const href = (f: Filter) => `/banking/${accountId}?${new URLSearchParams({ ...(f !== 'all' ? { filter: f } : {}), ...(q ? { q } : {}) })}`;
  const toReview = count('unreviewed');

  return (
    <Page
      title={account.name}
      subtitle={[account.institution, account.last4 && `•••• ${account.last4}`].filter(Boolean).join(' · ')}
      back={{ href: '/banking', label: 'Banking' }}
      actions={<Button href={`/banking/import?account=${accountId}`} size="sm" variant="tinted" icon={<Upload className="size-3.5" />}>Import</Button>}
      toolbar={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <LinkSegmented
            id="txn-filter" value={filter} className="lg:w-auto" full
            options={[
              { value: 'all', label: 'All', href: href('all') },
              { value: 'unreviewed', label: 'To review', href: href('unreviewed'), count: toReview },
              { value: 'matched', label: 'Matched', href: href('matched') },
              { value: 'ignored', label: 'Ignored', href: href('ignored') },
            ]}
          />
          <SearchBox defaultValue={q} placeholder="Search description or amount" hidden={{ filter: filter !== 'all' ? filter : '' }} />
        </div>
      }
    >
      <Card className="mb-6 flex flex-wrap items-center gap-4">
        <AccountTile kind={account.kind} color={account.color} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-footnote text-label-2">{card ? (balance <= 0 ? 'Balance owing' : 'Credit balance') : 'Balance'}{all.length ? ` · ${date(all[all.length - 1]!.posted_on, 'MMM d, yyyy')}` : ''}</p>
          <BigMoney value={card ? Math.abs(balance) : balance} currency={account.currency} className="text-title1" />
        </div>
        <div className="flex gap-2">
          {toReview > 0 && <Button href={`/banking/review?account=${accountId}`} size="sm" variant="filled" icon={<Inbox className="size-3.5" />}>Review {toReview}</Button>}
          <Button href={`/banking/${accountId}/reconcile`} size="sm" variant="gray" icon={<Scale className="size-3.5" />}>Reconcile</Button>
        </div>
      </Card>

      <TxnList rows={visible} currency={account.currency} accountId={accountId} empty={
        all.length === 0 ? 'none' : q ? 'search' : filter
      } />
    </Page>
  );
}

function match(r: TxnRow, f: Filter) {
  if (f === 'all') return true;
  if (f === 'matched') return r.status === 'matched' || r.status === 'created';
  return r.status === f;
}
