import Link from 'next/link';
import { ChevronRight, Inbox, PlugZap, Upload, Wand2, Scale } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile, Card } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { BigMoney } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/empty';
import { AccountTile } from '@/components/banking/bits';
import { ImportHistory, type HistoryRow } from '@/components/banking/import-history';
import { db, must } from '@/lib/db';
import { allMembers } from '@/lib/session';
import { date, plural, relativeDay } from '@/lib/format';
import { accountSummaries } from './_lib/data';

export const metadata = { title: 'Banking' };

export default async function BankingPage() {
  const [summaries, supabase, members] = await Promise.all([accountSummaries(), db(), allMembers()]);
  const [batches, rules, auto] = await Promise.all([
    supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('rules').select('id', { count: 'exact', head: true }),
    supabase.from('bank_transactions').select('import_batch').eq('auto_matched', true),
  ]);
  const autoMatched = must(auto);
  const toReview = summaries.reduce((s, a) => s + a.toReview, 0);
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.full_name]));
  const acct = Object.fromEntries(summaries.map((s) => [s.account.id, s.account]));
  const history: HistoryRow[] = must(batches).map((b) => ({
    id: b.id, fileName: b.file_name, accountName: acct[b.account_id]?.name ?? 'Account', accountKind: acct[b.account_id]?.kind ?? 'bank',
    accountColor: acct[b.account_id]?.color ?? null, dateFrom: b.date_from, dateTo: b.date_to, imported: b.rows_imported, duplicates: b.rows_duplicate,
    matched: autoMatched.filter((t) => t.import_batch === b.id).length, by: b.imported_by ? nameOf[b.imported_by] ?? null : null, at: b.created_at, hasFile: !!b.file_path,
  }));

  return (
    <Page
      title="Banking"
      subtitle="Accounts, statement imports and review"
      actions={<Button href="/banking/import" variant="filled" size="sm" icon={<Upload className="size-4" />}>Import</Button>}
    >
      {toReview > 0 && (
        <Link href="/banking/review" className="pressable mb-6 block">
          <Card className="flex items-center gap-3">
            <IconTile color="#E5A00D"><Inbox strokeWidth={2.2} /></IconTile>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{plural(toReview, 'transaction')} to review</p>
              <p className="text-footnote text-label-2">Match them to records, add expenses, or set them aside</p>
            </div>
            <span className="hidden text-subhead font-semibold text-accent-text sm:inline">Start</span>
            <ChevronRight className="size-4 text-label-3" />
          </Card>
        </Link>
      )}

      {summaries.length === 0 ? (
        <EmptyState icon={<Upload />} title="No bank accounts yet" message="Add your EQ Bank accounts and business card in Settings, then import a statement." action={<Button href="/settings" variant="tinted">Open Settings</Button>} />
      ) : (
        <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map(({ account: a, balance, asOf, toReview: n, lastImport, count }) => {
            const card = a.kind === 'credit_card';
            return (
              <Card key={a.id} className="flex flex-col">
                <Link href={`/banking/${a.id}`} className="group flex items-center gap-2.5">
                  <AccountTile kind={a.kind} color={a.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block truncate text-footnote text-label-2">{[a.institution, a.last4 && `•••• ${a.last4}`, a.currency !== 'CAD' && a.currency].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-label-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <div className="mt-4">
                  <p className="text-footnote text-label-2">{card ? (balance <= 0 ? 'Balance owing' : 'Credit balance') : 'Balance'}</p>
                  <BigMoney value={card ? Math.abs(balance) : balance} currency={a.currency} className="text-title1" />
                  <p className="mt-0.5 text-footnote text-label-3">
                    {count ? `As of ${date(asOf, 'MMM d')} · last import ${lastImport ? relativeDay(lastImport) : '—'}` : 'Nothing imported yet'}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button href={`/banking/import?account=${a.id}`} size="sm" variant="tinted" icon={<Upload className="size-3.5" />}>Import</Button>
                  {n > 0 ? (
                    <Button href={`/banking/review?account=${a.id}`} size="sm" variant="gray">
                      <span className="tabular rounded-full bg-orange-soft px-1.5 text-caption font-bold text-orange">{n}</span> to review
                    </Button>
                  ) : count > 0 ? (
                    <Button href={`/banking/${a.id}/reconcile`} size="sm" variant="gray" icon={<Scale className="size-3.5" />}>Reconcile</Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-6">
        <div>
          <ImportHistory rows={history} />
        </div>
        <div>
          <Section inset={58}>
            <Row href="/banking/review" icon={<IconTile color="#E5A00D"><Inbox strokeWidth={2.2} /></IconTile>} title="Review queue" value={toReview ? String(toReview) : 'Done'} />
            <Row href="/banking/rules" icon={<IconTile color="var(--purple)"><Wand2 strokeWidth={2.2} /></IconTile>} title="Rules" value={String(rules.count ?? 0)} />
            {summaries.filter((s) => s.count > 0).map((s) => (
              <Row key={s.account.id} href={`/banking/${s.account.id}/reconcile`} icon={<IconTile color="var(--fill-3)" fg="var(--label-2)"><Scale strokeWidth={2.2} /></IconTile>} title={`Reconcile ${s.account.name}`} />
            ))}
          </Section>

          <Card className="mb-7">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-soft text-blue"><PlugZap className="size-[18px]" /></span>
              <div>
                <p className="font-semibold">Automatic bank feed — later</p>
                <p className="mt-1 text-subhead text-label-2">
                  EQ Bank doesn’t offer a free direct connection, so statements come in as CSV files — about a minute a month.
                  A service like Plaid can be added later to pull transactions in daily; the review queue, rules and duplicate checks stay exactly the same.
                </p>
                <p className="mt-2 text-footnote text-label-3">In EQ online banking: open the account → Download (↓) → CSV.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
