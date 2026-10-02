import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeftRight, Car, Receipt, ShoppingBag, HandCoins, PiggyBank, Landmark, AlertTriangle, Scale, Info } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card } from '@/components/ui/group';
import { BigMoney, Money } from '@/components/ui/money';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LinkSegmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty';
import { SettleSheet } from '@/components/balances/settle-sheet';
import { TransferMenu } from '@/components/balances/transfer-menu';
import { ownerBalances, type LedgerEntry, type MemberSummary } from '@/components/balances/server';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { date, money, isoToday, plural } from '@/lib/format';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Owner balances' };

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ member?: string; new?: string }> }) {
  const sp = await searchParams;
  const [me, profile, supabase] = await Promise.all([currentMember(), businessProfile(), db()]);
  const [summaries, accounts] = await Promise.all([
    ownerBalances(profile.shareholder_loan_alert_days),
    supabase.from('money_accounts').select('id, name, kind').eq('archived', false).eq('is_business', true).order('kind'),
  ]);
  const selected = summaries.find((s) => s.member.id === sp.member) ?? summaries.find((s) => s.member.id === me.id) ?? summaries[0];
  if (!selected) return <Page title="Owner balances"><EmptyState icon={<Scale />} title="No owners yet" message="Add members in Settings to track who owes whom." /></Page>;
  const first = (s: MemberSummary) => s.member.full_name.split(' ')[0]!;
  const openHref = (memberId: string) => `/balances?member=${memberId}&new=1`;

  return (
    <Page
      title="Owner balances"
      subtitle="Who owes whom, and why"
      actions={
        <Button href={openHref(selected.member.id)} variant="filled" size="md" icon={<ArrowLeftRight className="size-4" />}>Settle up</Button>
      }
    >
      <div className="mb-7 grid grid-cols-[minmax(0,1fr)] gap-3 lg:mb-6 lg:grid-cols-2 lg:gap-4">
        {summaries.map((s) => <MemberCard key={s.member.id} s={s} href={openHref(s.member.id)} />)}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-6">
        <div>
          <LoanCard summaries={summaries} alertDays={profile.shareholder_loan_alert_days} yearEnd={profile.fiscal_year_end} />
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-title3 font-semibold">Ledger</h2>
            <LinkSegmented
              id="ledger-member"
              value={selected.member.id}
              options={summaries.map((s) => ({ value: s.member.id, label: first(s), href: `/balances?member=${s.member.id}` }))}
            />
          </div>
          <Ledger s={selected} />
        </div>
      </div>

      <SettleSheet
        open={sp.new === '1'}
        members={summaries.map((s) => s.member)}
        defaultMemberId={selected.member.id}
        accounts={must(accounts)}
        openItems={Object.fromEntries(summaries.map((s) => [s.member.id, s.open]))}
        balances={Object.fromEntries(summaries.map((s) => [s.member.id, s.balance]))}
        today={isoToday()}
        closeHref={`/balances?member=${selected.member.id}`}
      />
    </Page>
  );
}

function MemberCard({ s, href }: { s: MemberSummary; href: string }) {
  const name = s.member.full_name.split(' ')[0]!;
  const b = s.balance;
  const headline = Math.abs(b) < 0.005 ? `${name} and the company are square` : b > 0 ? `Company owes ${name}` : `${name} owes the company`;
  const lines: { label: string; value: number; open?: number; icon: React.ReactNode }[] = [
    { label: 'Business spending paid personally', value: s.breakdown.outOfPocket, open: s.unsettled.outOfPocket, icon: <Receipt /> },
    { label: 'Personal charges on business funds', value: s.breakdown.personal, open: s.unsettled.personal, icon: <ShoppingBag /> },
    { label: 'Mileage', value: s.breakdown.mileage, open: s.unsettled.mileage, icon: <Car /> },
    { label: 'Start-up loan & contributions', value: s.breakdown.contributions, icon: <PiggyBank /> },
    { label: 'Reimbursements paid out', value: s.breakdown.reimbursements, icon: <HandCoins /> },
    { label: 'Repayments to the company', value: s.breakdown.repayments, icon: <Landmark /> },
  ].filter((l) => l.value !== 0);
  return (
    <Card padded={false}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={s.member.full_name} color={s.member.color} initials={s.member.initials} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-subhead font-medium text-label-2">{headline}</p>
          <BigMoney value={Math.abs(b)} className={cn('text-title1', b < 0 && 'text-orange')} />
        </div>
      </div>
      <div className="group-rows" style={{ ['--row-inset' as string]: '48px' }}>
        {lines.map((l) => (
          <div key={l.label} className="flex min-h-[44px] items-center gap-3 px-4 text-subhead lg:min-h-9">
            <span className="flex size-5 shrink-0 items-center justify-center text-label-3 [&_svg]:size-[18px]">{l.icon}</span>
            <span className="min-w-0 flex-1 py-1.5">
              <span className="block truncate text-label-2">{l.label}</span>
              {!!l.open && <span className="tabular block text-footnote text-orange">{money(Math.abs(l.open))} not yet settled</span>}
            </span>
            <Money value={l.value} sign className="font-medium" />
          </div>
        ))}
        <div className="flex min-h-[44px] items-center gap-3 px-4 text-subhead font-semibold lg:min-h-9">
          <span className="size-5 shrink-0" />
          <span className="flex-1">Balance</span>
          <Money value={b} sign />
        </div>
      </div>
      <div className="flex items-center gap-3 p-4 pt-3 hairline-t">
        <p className="min-w-0 flex-1 text-footnote text-label-2">
          {s.unsettled.count ? <>{plural(s.unsettled.count, 'open item')} · net {s.unsettled.net >= 0 ? `${money(s.unsettled.net)} owed to ${name}` : `${money(-s.unsettled.net)} owed by ${name}`}</> : 'Everything is settled.'}
        </p>
        <Button href={href} variant="tinted" size="sm">Settle up</Button>
      </div>
    </Card>
  );
}

function LoanCard({ summaries, alertDays, yearEnd }: { summaries: MemberSummary[]; alertDays: number; yearEnd: string }) {
  const [m, d] = yearEnd.split('-').map(Number);
  const fyeLabel = format(new Date(2000, m! - 1, d!), 'MMMM d');
  const items = summaries.flatMap((s) => s.loanItems.map((i) => ({ ...i, s })));
  const alerts = items.filter((i) => i.alert);
  return (
    <>
      <Section title="Shareholder loans · CRA s.15(2)">
        <div className="space-y-2 p-4 text-subhead lg:p-3">
          <p>When an owner owes the company — like a personal purchase on the business card — that’s a <span className="font-semibold">shareholder loan</span>.</p>
          <p className="text-label-2">It has to be repaid within one year after the end of the fiscal year it happened in (year-end is {fyeLabel}), or CRA adds it to the owner’s income. Repaying it, or netting it against money the company owes them, avoids that.</p>
          <p className="text-label-2">Personal charges are never a business expense — they’re left out of deductions and ITCs automatically.</p>
        </div>
      </Section>
      <Section title={alerts.length ? `${plural(alerts.length, 'item')} to repay soon` : 'Open personal items'} inset={52}
        footer={items.length ? `Flagged within ${alertDays} days of the repay-by date. If the company owes the owner more overall, use “Offset only” in Settle up.` : undefined}>
        {items.length === 0 && <p className="px-4 py-4 text-subhead text-label-2 lg:px-3">No open shareholder-loan items. Nice and clean.</p>}
        {items.slice(0, 12).map((i) => (
          <Row
            key={i.id}
            href={`/expenses/${i.id}`}
            icon={<Avatar name={i.s.member.full_name} color={i.s.member.color} initials={i.s.member.initials} size={28} />}
            title={i.label}
            subtitle={`${date(i.date)} · repay by ${date(i.repay_by)}`}
            value={<span className="text-label">{money(-i.amount)}</span>}
            detail={<span className={cn(i.daysLeft < 0 ? 'font-semibold text-red' : i.alert ? 'font-medium text-orange' : '')}>{i.daysLeft < 0 ? `${-i.daysLeft}d overdue` : `${i.daysLeft} days left`}</span>}
          />
        ))}
        {items.length > 12 && <p className="px-4 py-2.5 text-footnote text-label-2 lg:px-3">+ {items.length - 12} more in the ledger</p>}
      </Section>
      {alerts.some((a) => a.daysLeft < 0) && (
        <p className="-mt-4 mb-7 flex gap-2 rounded-group bg-red-soft p-3 text-footnote text-red">
          <AlertTriangle className="size-4 shrink-0" />
          Some items are past their repay-by date. Talk to your accountant — if the owner’s overall balance is positive they’re likely covered by offset.
        </p>
      )}
    </>
  );
}

const KIND_META: Record<string, { label: string; icon: typeof Receipt; tone: string }> = {
  out_of_pocket: { label: 'Paid personally', icon: Receipt, tone: 'bg-accent-soft text-accent-text' },
  personal_on_business: { label: 'Personal on business funds', icon: ShoppingBag, tone: 'bg-purple-soft text-purple' },
  personal_portion: { label: 'Personal share', icon: ShoppingBag, tone: 'bg-orange-soft text-orange' },
  mileage: { label: 'Mileage', icon: Car, tone: 'bg-blue-soft text-blue' },
  reimbursement: { label: 'Reimbursement', icon: HandCoins, tone: 'bg-fill text-label-2' },
  repayment: { label: 'Repayment', icon: Landmark, tone: 'bg-fill text-label-2' },
  contribution: { label: 'Contribution', icon: PiggyBank, tone: 'bg-fill text-label-2' },
  dividend: { label: 'Dividend', icon: ArrowLeftRight, tone: 'bg-fill text-label-2' },
  salary: { label: 'Salary', icon: ArrowLeftRight, tone: 'bg-fill text-label-2' },
  other: { label: 'Transfer', icon: ArrowLeftRight, tone: 'bg-fill text-label-2' },
};

function Ledger({ s }: { s: MemberSummary }) {
  if (!s.ledger.length) return <EmptyState icon={<Scale />} title="Nothing yet" message="Out-of-pocket spending, personal charges, mileage and transfers will show up here." />;
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of s.ledger) {
    const k = e.occurred_on.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return (
    <>
      {[...groups.entries()].map(([k, list]) => (
        <section key={k} className="mb-6">
          <div className="mb-1.5 flex items-end justify-between px-4 lg:px-1">
            <h3 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2">{format(parseISO(k + '-01'), 'MMMM yyyy')}</h3>
            <span className="tabular text-footnote text-label-3">Balance {money(list[0]!.running)}</span>
          </div>
          <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '58px' }}>
            {list.map((e) => <LedgerRow key={`${e.entry_type}:${e.entity_id}`} e={e} />)}
          </div>
        </section>
      ))}
      <p className="flex gap-2 px-4 text-footnote text-label-2 lg:px-1"><Info className="mt-0.5 size-4 shrink-0" /> Running balance after each entry. Positive = the company owes the owner.</p>
    </>
  );
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  const meta = KIND_META[e.kind] ?? KIND_META.other!;
  const I = meta.icon;
  const href = e.entry_type === 'expense' ? `/expenses/${e.entity_id}` : e.entry_type === 'mileage' ? '/mileage' : undefined;
  const open = e.entry_type !== 'transfer' && !e.settled;
  const inner = (
    <>
      <span className={cn('flex size-[30px] shrink-0 items-center justify-center rounded-[8px]', meta.tone)}><I className="size-4" strokeWidth={2.1} /></span>
      <span className="min-w-0 flex-1 py-2.5 lg:py-2">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body">{e.entry_type === 'transfer' ? meta.label : e.label}</span>
          {open && <Badge tone="orange">Open</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-footnote text-label-2">
          {date(e.occurred_on, 'MMM d')} · {e.entry_type === 'transfer' ? (e.detail || (e.amount === 0 ? 'Doesn’t change the balance' : 'Transfer')) : `${meta.label}${e.detail ? ` · ${e.detail}` : ''}`}
          {e.kind === 'personal_portion' && e.total_cad ? ` · of ${money(e.total_cad)}` : ''}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end text-right">
        <Money value={e.amount} sign className={cn('text-body font-medium', e.amount > 0 ? 'text-accent-text' : e.amount < 0 ? 'text-label' : 'text-label-3')} />
        <span className="tabular mt-0.5 text-caption text-label-3">{money(e.running)}</span>
      </span>
    </>
  );
  const cls = 'flex min-h-[58px] items-center gap-3 px-4 lg:min-h-12 lg:px-3';
  if (href) return <Link href={href} className={cn(cls, 'row-press')}>{inner}</Link>;
  return <div className={cls}>{inner}<TransferMenu id={e.entity_id} label={meta.label} /></div>;
}
