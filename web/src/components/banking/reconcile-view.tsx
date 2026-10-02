'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, CircleAlert, Scale } from 'lucide-react';
import { Section, Row, Card } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { Input, TextArea } from '@/components/ui/fields';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { cn } from '@/lib/cn';
import { date as fmtDate, money, plural, relativeDay, round2 } from '@/lib/format';
import { reconcileMonth, unreconcileMonth } from '@/app/(app)/banking/[accountId]/reconcile/actions';
import { SignedAmount } from './bits';

export type MonthInfo = {
  month: string; periodEnd: string; ended: boolean; opening: number; computed: number; bankBalance: number | null;
  moneyIn: number; moneyOut: number; unreviewed: number;
  txns: { id: string; postedOn: string; description: string; amount: number; status: string }[];
  reconciliation: { id: string; statement: number; computed: number; notes: string | null; by: string | null; at: string } | null;
};

export function ReconcileView({ accountId, accountKind, currency, months, selected }: {
  accountId: string; accountKind: string; currency: string; months: MonthInfo[]; selected: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const card = accountKind === 'credit_card';
  const m = months.find((x) => x.month === selected) ?? null;
  // Cards show what you owe as a positive number on the statement; the app stores it as negative.
  const toShown = (v: number) => (card ? -v : v);
  const [entered, setEntered] = useState(m?.reconciliation ? String(toShown(m.reconciliation.statement).toFixed(2)) : '');
  const [notes, setNotes] = useState(m?.reconciliation?.notes ?? '');
  const [busy, setBusy] = useState(false);

  if (!m) return <EmptyState icon={<Scale />} title="Nothing to reconcile yet" message="Import a statement first, then check its closing balance here." action={<Button href={`/banking/import?account=${accountId}`} variant="tinted">Import a statement</Button>} />;

  const statement = entered.trim() === '' ? null : round2(Number(entered.replace(/[^\d.-]/g, '')) * (card ? -1 : 1));
  const diff = statement === null ? null : round2(statement - m.computed);
  const balanced = diff !== null && Math.abs(diff) < 0.005;
  const rec = m.reconciliation;

  async function save() {
    if (statement === null || Number.isNaN(statement)) return toast({ title: 'Enter the statement’s closing balance.', tone: 'error' });
    setBusy(true);
    const res = await reconcileMonth({ accountId, periodEnd: m!.periodEnd, statementBalance: statement, notes: notes || null });
    setBusy(false);
    if (!res.ok) return toast({ title: res.error, tone: 'error' });
    toast({ title: `${fmtDate(m!.periodEnd, 'MMMM')} reconciled` });
    router.refresh();
  }
  async function remove() {
    if (!rec) return;
    const ok = await confirm({ title: 'Remove this reconciliation?', message: 'The month goes back to unreconciled. Transactions aren’t changed.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    const res = await unreconcileMonth(rec.id);
    toast(res.ok ? { title: res.message ?? 'Removed' } : { title: res.error, tone: 'error' });
    router.refresh();
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-6">
      <div>
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:flex-wrap lg:px-0">
          {months.slice(0, 18).map((x) => (
            <Link
              key={x.month} href={`?month=${x.month}`} replace scroll={false}
              className={cn('pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium lg:h-7 lg:px-3 lg:text-footnote',
                x.month === m.month ? 'bg-label text-bg' : 'bg-cell text-label shadow-card')}
            >
              {x.reconciliation && <CheckCircle2 className={cn('size-3.5', x.month === m.month ? 'text-bg' : 'text-accent-text')} />}
              {fmtDate(x.month + '-01', x.month.slice(0, 4) === months[0]!.month.slice(0, 4) ? 'MMM' : 'MMM yyyy')}
            </Link>
          ))}
        </div>

        <Section title={`${fmtDate(m.month + '-01', 'MMMM yyyy')} in the app`}>
          <Row title={`Opening · ${fmtDate(m.month + '-01', 'MMM d')}`} value={money(toShown(m.opening), currency)} />
          <Row title="Money in" value={<span className="text-accent-text">{money(m.moneyIn, currency, { sign: true })}</span>} />
          <Row title="Money out" value={money(m.moneyOut, currency)} />
          <Row title={<span className="font-semibold">{card ? 'Owing' : 'Balance'} · {fmtDate(m.periodEnd, 'MMM d')}</span>} value={<span className="font-semibold text-label">{money(toShown(m.computed), currency)}</span>} />
        </Section>

        {!m.ended && !rec && (
          <p className="-mt-4 mb-6 px-4 text-footnote text-orange lg:px-1">This month isn’t over yet — reconcile it once the statement is out.</p>
        )}

        {rec ? (
          <Card className="mb-7">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><CheckCircle2 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Reconciled</p>
                <p className="text-footnote text-label-2">Statement {money(toShown(rec.statement), currency)}{Math.abs(rec.statement - rec.computed) >= 0.005 ? ` · app ${money(toShown(rec.computed), currency)}` : ''} · {rec.by?.split(' ')[0] ?? 'Someone'} · {relativeDay(rec.at)}</p>
                {rec.notes && <p className="mt-1 text-footnote text-label-2">“{rec.notes}”</p>}
                {Math.abs(rec.computed - m.computed) >= 0.005 && (
                  <p className="mt-2 text-footnote font-medium text-orange">Transactions changed since — the app now shows {money(toShown(m.computed), currency)}. Reconcile again.</p>
                )}
              </div>
              <Button size="sm" variant="plain" onClick={remove}>Remove</Button>
            </div>
          </Card>
        ) : null}

        <Section title={rec ? 'Reconcile again' : 'Statement'} footer={m.bankBalance !== null && !rec ? (
          <>The imported file said {money(toShown(m.bankBalance), currency)} at month end. <button type="button" className="font-medium text-accent-text" onClick={() => setEntered(toShown(m.bankBalance!).toFixed(2))}>Use it</button>, or type the figure from the PDF statement.</>
        ) : 'Type the closing balance printed on the statement.'}>
          <Input label={card ? 'Balance owing' : 'Closing balance'} name="statement" inputMode="decimal" placeholder="0.00" align="right" value={entered}
            onChange={(e) => setEntered(e.target.value.replace(/[^\d.-]/g, ''))} trailing={currency === 'CAD' ? '$' : currency} />
        </Section>

        {diff !== null && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className={cn('mb-5 flex items-center gap-3 rounded-group p-4', balanced ? 'bg-accent-soft' : 'bg-orange-soft')}>
            {balanced ? <CheckCircle2 className="size-6 shrink-0 text-accent-text" /> : <CircleAlert className="size-6 shrink-0 text-orange" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{balanced ? 'Balanced' : `Off by ${money(Math.abs(diff), currency)}`}</p>
              <p className="text-footnote text-label-2">
                {balanced ? 'The statement and the app agree.' : toShown(diff!) > 0
                  ? `The statement shows more than the app — a ${card ? 'charge' : 'deposit'} may be missing from the import.`
                  : `The statement shows less than the app — look for a duplicate ${card ? 'charge' : 'deposit'} or a missing ${card ? 'payment or refund' : 'withdrawal'}.`}
              </p>
            </div>
          </motion.div>
        )}

        {diff !== null && !balanced && (
          <Section><TextArea name="notes" rows={2} placeholder="Why is there a difference? (required to reconcile anyway)" value={notes} onChange={(e) => setNotes(e.target.value)} /></Section>
        )}

        <Button variant="filled" size="lg" block loading={busy} disabled={diff === null || (!balanced && !notes.trim())} onClick={save} className="mb-8">
          {balanced ? `Mark ${fmtDate(m.periodEnd, 'MMMM')} reconciled` : 'Reconcile with a difference'}
        </Button>
      </div>

      <div>
        <Section
          title={`${plural(m.txns.length, 'transaction')} in ${fmtDate(m.month + '-01', 'MMMM')}`}
          action={m.unreviewed ? <Link href={`/banking/review?account=${accountId}`} className="text-footnote font-medium text-accent-text">{m.unreviewed} to review</Link> : undefined}
        >
          {m.txns.length === 0 && <p className="px-4 py-6 text-center text-subhead text-label-2">No transactions this month.</p>}
          {m.txns.map((t) => (
            <Row key={t.id} title={t.description} subtitle={fmtDate(t.postedOn, 'MMM d')}>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <SignedAmount value={t.amount} currency={currency} className="text-subhead" />
                {t.status === 'unreviewed' && <StatusBadge status="unreviewed" />}
              </span>
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}
