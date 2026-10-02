import Link from 'next/link';
import { format, subDays } from 'date-fns';
import {
  AlertTriangle, Inbox, ReceiptText, Scale, FileClock, CalendarClock, FileText, Receipt, HandCoins, Upload, ArrowLeftRight, ChevronRight, Landmark,
} from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile, Card } from '@/components/ui/group';
import { BigMoney, Money } from '@/components/ui/money';
import { Avatar } from '@/components/ui/avatar';
import { BarChart } from '@/components/charts/bar-chart';
import { SearchButton } from '@/components/shell/search-palette';
import { InstallHint } from '@/components/shell/install-guide';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { cashPositions, receivables, gstForFiscalYear, monthlySeries } from '@/lib/finance';
import { fiscalYearOf } from '@/lib/fiscal';
import { money, num, relativeDay, daysUntil, plural, date } from '@/lib/format';

export const metadata = { title: 'Home' };

export default async function Home() {
  const [me, profile, members, supabase] = await Promise.all([currentMember(), businessProfile(), allMembers(), db()]);
  const fyNow = fiscalYearOf(new Date(), profile.fiscal_year_end);
  // Right after year-end the useful number is the year that just closed.
  const gstYear = daysSinceFyStart(profile.fiscal_year_end) < 100 ? fyNow - 1 : fyNow;

  const [cash, ar, gst, series, balances, review, missing, drafts, estimates, filings, activity] = await Promise.all([
    cashPositions(),
    receivables(),
    gstForFiscalYear(gstYear, profile.fiscal_year_end),
    monthlySeries(12),
    supabase.from('member_balances').select('*'),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed'),
    supabase.from('expense_overview').select('id', { count: 'exact', head: true }).eq('attachment_count', 0).neq('nature', 'personal').gte('spent_on', format(subDays(new Date(), 120), 'yyyy-MM-dd')),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('kind', 'estimate').eq('status', 'sent'),
    supabase.from('tax_filings').select('*').is('filed_on', null).order('due_on').limit(4),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
  ]);

  const bankCad = cash.filter((a) => a.kind === 'bank').reduce((s, a) => s + a.balanceCad, 0);
  const card = cash.find((a) => a.kind === 'credit_card');
  const memberBalances = must(balances);
  const owedToMembers = memberBalances.reduce((s, b) => s + Math.max(0, num(b.balance)), 0);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const yearIn = series.reduce((s, m) => s + m.in, 0);
  const yearOut = series.reduce((s, m) => s + m.out, 0);
  const hour = Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hour12: false, timeZone: profile.timezone }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const attention = [
    ar.overdueCount > 0 && { href: '/invoices?filter=overdue', icon: AlertTriangle, color: '#E0352B', title: `${plural(ar.overdueCount, 'invoice')} overdue`, value: money(ar.overdue) },
    (review.count ?? 0) > 0 && { href: '/banking/review', icon: Inbox, color: '#E5A00D', title: `${plural(review.count ?? 0, 'transaction')} to review`, sub: 'From the latest bank and card imports', value: '' },
    (missing.count ?? 0) > 0 && { href: '/expenses?filter=no-receipt', icon: ReceiptText, color: '#E8833A', title: `${plural(missing.count ?? 0, 'receipt')} missing`, sub: 'Business expenses in the last 4 months', value: '' },
    (drafts.count ?? 0) > 0 && { href: '/invoices?filter=draft', icon: FileClock, color: '#6B7B80', title: `${plural(drafts.count ?? 0, 'draft')} not sent yet`, value: '' },
    (estimates.count ?? 0) > 0 && { href: '/estimates?filter=sent', icon: FileText, color: '#7C4DDB', title: `${plural(estimates.count ?? 0, 'estimate')} awaiting reply`, value: '' },
    owedToMembers > 0 && { href: '/balances', icon: Scale, color: '#05A38C', title: 'Owners to reimburse', sub: 'Out-of-pocket spending and start-up loans', value: money(owedToMembers, 'CAD', { cents: false }) },
  ].filter(Boolean) as { href: string; icon: typeof AlertTriangle; color: string; title: string; sub?: string; value: string }[];

  const attentionList = (
        <Section title="Needs attention" inset={58}>
            {attention.length === 0 && <div className="px-4 py-6 text-center text-subhead text-label-2">All caught up.</div>}
            {attention.map((a) => (
              <Row key={a.href} href={a.href} icon={<IconTile color={a.color}><a.icon strokeWidth={2.2} /></IconTile>} title={a.title} subtitle={a.sub} value={a.value || undefined} />
            ))}
        </Section>
  );

  return (
    <Page
      title={`${greeting}, ${me.full_name.split(' ')[0]}`}
      subtitle={format(new Date(), 'EEEE, MMMM d')}
      actions={
        <>
          <SearchButton compact className="lg:hidden" />
          <Link href="/settings" className="lg:hidden"><Avatar name={me.full_name} color={me.color} initials={me.initials} size={32} /></Link>
        </>
      }
    >
      <InstallHint />

      {/* Headline numbers */}
      <div className="-mx-4 mb-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        <StatCard href="/banking" label="Cash in bank" tint="var(--ocean)" icon={<Landmark className="size-4" />}>
          <BigMoney value={bankCad} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">
            {cash.filter((a) => a.kind === 'bank').map((a) => `${a.currency} ${money(a.balance, a.currency, { cents: false })}`).join(' · ')}
          </p>
          {card && <p className="text-footnote text-label-3">Card owing {money(-card.balance)}</p>}
        </StatCard>
        <StatCard href="/invoices?filter=outstanding" label="Owed to you" tint="var(--teal)" icon={<HandCoins className="size-4" />}>
          <BigMoney value={ar.total} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">{plural(ar.open.length, 'open invoice')}</p>
          {ar.overdue > 0 && <p className="text-footnote font-medium text-red">{money(ar.overdue)} overdue</p>}
        </StatCard>
        <StatCard href="/tax/gst" label={`GST/HST · FY${gstYear}`} tint="#E0352B" icon={<CalendarClock className="size-4" />}>
          <BigMoney value={Math.max(0, gst.net)} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">{gst.net >= 0 ? 'Estimated to remit' : `Refund ${money(-gst.net)}`}</p>
          <p className="text-footnote text-label-3">Collected {money(gst.collected, 'CAD', { cents: false })} · ITCs {money(gst.itcs, 'CAD', { cents: false })}</p>
        </StatCard>
        <StatCard href="/balances" label="Owner balances" tint="var(--mint)" icon={<Scale className="size-4" />}>
          <div className="mt-0.5 space-y-1.5">
            {memberBalances.map((b) => {
              const m = memberById[b.member_id!];
              return (
                <div key={b.member_id} className="flex items-center gap-2">
                  <Avatar name={b.full_name!} color={m?.color} initials={m?.initials} size={22} />
                  <span className="flex-1 truncate text-subhead">{b.full_name!.split(' ')[0]}</span>
                  <Money value={b.balance} className="text-subhead font-semibold" />
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-footnote text-label-3">Positive = company owes them</p>
        </StatCard>
      </div>

      <div className="lg:hidden">{attentionList}</div>

      <div className="lg:grid lg:grid-cols-[1.45fr_1fr] lg:gap-6">
        <div>
          <Section title="Last 12 months" action={<Link href="/reports" className="text-footnote font-medium text-accent-text">Reports</Link>}>
            <div className="p-4">
              <div className="mb-4 flex gap-8">
                <div>
                  <div className="text-footnote text-label-2">Revenue</div>
                  <div className="tabular text-title3 font-semibold">{money(yearIn, 'CAD', { cents: false })}</div>
                </div>
                <div>
                  <div className="text-footnote text-label-2">Business spending</div>
                  <div className="tabular text-title3 font-semibold">{money(yearOut, 'CAD', { cents: false })}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-footnote text-label-2">Difference</div>
                  <div className="tabular text-title3 font-semibold">{money(yearIn - yearOut, 'CAD', { cents: false })}</div>
                </div>
              </div>
              <BarChart
                caption="Revenue and business spending by month"
                series={[{ key: 'in', label: 'Revenue (before tax)', color: 'var(--chart-in)' }, { key: 'out', label: 'Business spending', color: 'var(--chart-out)' }]}
                data={series.map((m) => ({ label: format(new Date(m.month + '-15'), 'MMM').slice(0, 3), sublabel: format(new Date(m.month + '-15'), 'MMMM yyyy'), values: { in: m.in, out: m.out } }))}
              />
            </div>
          </Section>

          <Section title="Recent activity" inset={60}>
            {must(activity).map((a) => {
              const m = a.member_id ? memberById[a.member_id] : null;
              const meta = ACTIVITY[a.entity_type] ?? { label: a.entity_type, href: () => '#' };
              return (
                <Row
                  key={a.id}
                  href={meta.href(a.entity_id)}
                  icon={m ? <Avatar name={m.full_name} color={m.color} initials={m.initials} size={30} /> : <IconTile color="var(--fill-3)" fg="var(--label-2)"><Upload /></IconTile>}
                  title={<><span className="font-medium">{m?.full_name.split(' ')[0] ?? 'System'}</span> <span className="text-label-2">{verb(a.action, a.entity_type)}</span></>}
                  subtitle={a.summary}
                  value={relativeDay(a.created_at)}
                />
              );
            })}
          </Section>
        </div>

        <div>
          <div className="hidden lg:block">{attentionList}</div>

          <Section title="Upcoming deadlines" inset={58} action={<Link href="/tax" className="text-footnote font-medium text-accent-text">Tax Centre</Link>}>
            {must(filings).map((f) => {
              const d = daysUntil(f.due_on!);
              return (
                <Row
                  key={f.id}
                  href="/tax"
                  icon={<DateTile iso={f.due_on!} urgent={d <= 21} />}
                  title={FILING[f.kind] ?? f.kind}
                  subtitle={f.notes ?? `${date(f.period_start)} – ${date(f.period_end)}`}
                  value={d < 0 ? 'Overdue' : d === 0 ? 'Today' : `${d} days`}
                />
              );
            })}
          </Section>

          <Section title="Shortcuts" className="lg:hidden">
            <div className="grid grid-cols-4 gap-1 p-2">
              {[
                { href: '/expenses/new', label: 'Expense', icon: Receipt },
                { href: '/invoices/new', label: 'Invoice', icon: FileText },
                { href: '/payments?new=1', label: 'Payment', icon: HandCoins },
                { href: '/balances?new=1', label: 'Transfer', icon: ArrowLeftRight },
              ].map((s) => (
                <Link key={s.href} href={s.href} className="pressable flex flex-col items-center gap-1.5 rounded-xl py-2.5 active:bg-fill-2">
                  <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-text"><s.icon className="size-5" /></span>
                  <span className="text-caption font-medium">{s.label}</span>
                </Link>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </Page>
  );
}

function StatCard({ href, label, tint, icon, children }: { href: string; label: string; tint: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="pressable group w-[78%] max-w-[300px] shrink-0 snap-start sm:w-[46%] lg:w-auto lg:max-w-none">
      <Card className="h-full">
        <div className="mb-2 flex items-center gap-1.5 text-footnote font-semibold" style={{ color: tint }}>
          {icon}
          <span className="text-label-2">{label}</span>
          <ChevronRight className="ml-auto size-4 text-label-3 transition-transform group-hover:translate-x-0.5" />
        </div>
        {children}
      </Card>
    </Link>
  );
}

function DateTile({ iso, urgent }: { iso: string; urgent?: boolean }) {
  const d = new Date(iso + 'T12:00:00');
  return (
    <span className="flex size-[34px] flex-col items-center justify-center overflow-hidden rounded-[8px] bg-cell shadow-[inset_0_0_0_0.5px_var(--separator-strong)] lg:size-[30px]">
      <span className={`w-full text-center text-[8.5px] font-bold uppercase leading-[11px] text-white ${urgent ? 'bg-red' : 'bg-label-3'}`}>{format(d, 'MMM')}</span>
      <span className="tabular text-[14px] font-semibold leading-[20px] lg:text-[13px] lg:leading-[17px]">{format(d, 'd')}</span>
    </span>
  );
}

function daysSinceFyStart(yearEnd: string) {
  const [m, d] = yearEnd.split('-').map(Number);
  const now = new Date();
  let start = new Date(now.getFullYear(), m! - 1, d! + 1);
  if (start > now) start = new Date(now.getFullYear() - 1, m! - 1, d! + 1);
  return Math.floor((now.getTime() - start.getTime()) / 864e5);
}

const FILING: Record<string, string> = { gst: 'GST/HST return', t2: 'T2 corporate return', t4: 'T4 slips', t5: 'T5 slips', other: 'Filing' };
const ACTIVITY: Record<string, { label: string; href: (id: string | null) => string }> = {
  invoices: { label: 'invoice', href: (id) => `/invoices/${id}` },
  payments: { label: 'payment', href: () => '/payments' },
  expenses: { label: 'expense', href: (id) => `/expenses/${id}` },
  member_transfers: { label: 'transfer', href: () => '/balances' },
  import_batches: { label: 'import', href: () => '/banking' },
  clients: { label: 'client', href: (id) => `/clients/${id}` },
  mileage_trips: { label: 'trip', href: () => '/mileage' },
  documents: { label: 'document', href: () => '/documents' },
  other_income: { label: 'income', href: () => '/banking' },
};
function verb(action: string, entity: string) {
  const noun = ACTIVITY[entity]?.label ?? entity;
  if (action === 'sent') return `sent ${noun}`;
  if (action === 'insert') return entity === 'payments' ? 'recorded payment' : entity === 'import_batches' ? 'imported' : `added ${noun}`;
  if (action === 'update') return `updated ${noun}`;
  if (action === 'delete') return `deleted ${noun}`;
  return action;
}
