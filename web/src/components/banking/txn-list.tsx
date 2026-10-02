'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Ban, Check, CircleDashed, FileSpreadsheet, Inbox, SearchX } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { date as fmtDate, money, relativeDay } from '@/lib/format';
import { reopenTransaction } from '@/app/(app)/banking/[accountId]/actions';
import { KindTile, KIND_META, SignedAmount } from './bits';
import type { MatchKind } from './types';

export type TxnRow = {
  id: string; postedOn: string; description: string; amount: number; balance: number; status: string; note: string | null;
  link: { kind: MatchKind; id: string; label: string; href: string | null } | null; auto: boolean; rule: string | null;
  batch: string | null; reviewedBy: string | null; reviewedAt: string | null;
};

function StatusTile({ row }: { row: TxnRow }) {
  if (row.link) return <KindTile kind={row.link.kind} />;
  const cls = 'flex size-[30px] shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-4';
  if (row.status === 'ignored') return <span className={`${cls} bg-fill-3 text-label-3`}><Ban /></span>;
  return <span className={`${cls} bg-orange-soft text-orange`}><CircleDashed /></span>;
}

export function TxnList({ rows, currency, accountId, empty }: { rows: TxnRow[]; currency: string; accountId: string; empty: string }) {
  const [open, setOpen] = useState<TxnRow | null>(null);
  const [shown, setShown] = useState(false);
  const months = useMemo(() => {
    const m = new Map<string, TxnRow[]>();
    for (const r of rows) { const k = r.postedOn.slice(0, 7); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()];
  }, [rows]);

  if (!rows.length) {
    const copy: Record<string, { title: string; message: string; icon: React.ReactNode }> = {
      none: { title: 'No transactions yet', message: 'Import a CSV statement to bring this account’s transactions in.', icon: <FileSpreadsheet /> },
      search: { title: 'No matches', message: 'Try part of the description or the amount without the $ sign.', icon: <SearchX /> },
      unreviewed: { title: 'Nothing to review', message: 'Every transaction in this account is matched, recorded or ignored.', icon: <Check /> },
      matched: { title: 'Nothing matched yet', message: 'Matched and recorded transactions show up here.', icon: <Inbox /> },
      ignored: { title: 'Nothing ignored', message: 'Transfers between your accounts and anything you set aside show up here.', icon: <Ban /> },
    };
    const c = copy[empty] ?? copy.none!;
    return <EmptyState icon={c.icon} title={c.title} message={c.message} action={empty === 'none' ? <Button href={`/banking/import?account=${accountId}`} variant="tinted">Import a statement</Button> : undefined} />;
  }

  return (
    <>
      {months.map(([month, list]) => {
        const net = list.reduce((s, r) => s + r.amount, 0);
        return (
          <Section key={month} inset={58} title={fmtDate(month + '-01', 'MMMM yyyy')} action={<span className="tabular text-footnote text-label-3">{money(net, currency, { sign: true })}</span>}>
            {list.map((r) => (
              <Row
                key={r.id}
                onClick={() => { setOpen(r); setShown(true); }}
                icon={<StatusTile row={r} />}
                title={r.description}
                subtitle={`${fmtDate(r.postedOn, 'MMM d')} · ${r.link?.label ?? (r.status === 'ignored' ? r.note ?? 'Ignored' : r.rule ? `Suggest: ${r.rule}` : 'To review')}`}
              >
                <span className="flex shrink-0 flex-col items-end">
                  <SignedAmount value={r.amount} currency={currency} className="text-body" />
                  <span className="tabular mt-0.5 text-footnote text-label-3">{money(r.balance, currency)}</span>
                </span>
              </Row>
            ))}
          </Section>
        );
      })}
      {open && <DetailSheet row={open} currency={currency} accountId={accountId} open={shown} onClose={() => setShown(false)} />}
    </>
  );
}

function DetailSheet({ row, currency, accountId, open, onClose }: { row: TxnRow; currency: string; accountId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function reopen() {
    setBusy(true);
    const res = await reopenTransaction(row.id);
    setBusy(false);
    toast(res.ok ? { title: res.message ?? 'Done' } : { title: res.error, tone: 'error' });
    if (res.ok) { onClose(); router.refresh(); }
  }
  const reviewed = row.status !== 'unreviewed';
  return (
    <Sheet open={open} onClose={onClose} title="Transaction" fit cancelLabel="Done">
      <div className="flex flex-col items-center pb-5 pt-2 text-center">
        <SignedAmount value={row.amount} currency={currency} className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em]" />
        <p className="mt-2 max-w-[90%] break-words text-headline font-semibold">{row.description}</p>
        <p className="mt-0.5 text-footnote text-label-2">{fmtDate(row.postedOn, 'EEEE, MMMM d, yyyy')}</p>
        <div className="mt-2"><StatusBadge status={row.status} /></div>
      </div>

      {row.link && (
        <Section title={row.status === 'created' ? 'Recorded as' : 'Matched to'} inset={58} footer={row.auto ? 'Matched automatically on import — same amount, within a few days.' : undefined}>
          <Row icon={<KindTile kind={row.link.kind} />} title={row.link.label} subtitle={KIND_META[row.link.kind].label} href={row.link.href ?? undefined}>
            {row.link.href && <ArrowUpRight className="size-4 shrink-0 text-label-3" />}
          </Row>
        </Section>
      )}

      <Section>
        <Row title="Balance after" value={money(row.balance, currency)} />
        {row.note && <Row title="Note" value={row.note} />}
        {row.rule && !row.link && <Row title="Rule suggests" value={row.rule} />}
        {row.batch && <Row title="Imported from" value={<span className="block max-w-[200px] truncate">{row.batch}</span>} />}
        {row.reviewedBy && <Row title="Reviewed" value={`${row.reviewedBy.split(' ')[0]} · ${relativeDay(row.reviewedAt)}`} />}
      </Section>

      <div className="flex flex-col gap-2 pb-2">
        {!reviewed && <Button href={`/banking/review?account=${accountId}`} variant="filled" size="lg" block>Review now</Button>}
        {reviewed && (
          <Button variant={row.link ? 'destructive-tinted' : 'tinted'} size="lg" block loading={busy} onClick={reopen}>
            {row.link ? 'Unmatch' : 'Re-open for review'}
          </Button>
        )}
        {reviewed && row.link && (
          <p className="px-2 text-center text-footnote text-label-3">
            {row.link.label.split(' · ')[0]} stays in your records — only the link to this bank row is removed, and the row goes back to review.
          </p>
        )}
        {row.link?.href && <Link href={row.link.href} className="py-2 text-center text-subhead font-medium text-accent-text">Open {KIND_META[row.link.kind].label.toLowerCase()}</Link>}
      </div>
    </Sheet>
  );
}
