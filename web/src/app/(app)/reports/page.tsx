import { ChartColumn, PieChart, Users, Wallet, HandCoins, ArrowLeftRight } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { PeriodPicker } from '@/components/tax/period-picker';
import { periodFromParams } from '@/components/tax/books';
import { periodLong } from '@/components/tax/period';
import { profitAndLoss, revenueByClient, arAging, cashFlow } from '@/components/reports/data';
import { currentMember } from '@/lib/session';
import { isoToday, money, plural } from '@/lib/format';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams({ fy: (await searchParams).fy });
  const q = `?fy=${period.fy}`;
  const [pl, rev, ar, cf] = await Promise.all([profitAndLoss(period), revenueByClient(period), arAging(isoToday()), cashFlow(period)]);
  const topCat = pl.expense[0];
  const topClient = rev.rows[0];

  return (
    <Page title="Reports" subtitle={periodLong(period)} toolbar={<PeriodPicker path="/reports" years={ctx.years} fy={period.fy} />}>
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <Section title="Performance" inset={58}>
          <Row href={`/reports/profit-loss${q}`} icon={<IconTile color="#7C4DDB"><ChartColumn /></IconTile>} title="Profit & loss" subtitle="Monthly revenue, expenses and net income" value={money(pl.net, 'CAD', { cents: false })} detail="net income" />
          <Row href={`/reports/revenue${q}`} icon={<IconTile color="#05A38C"><Users /></IconTile>} title="Revenue by client" subtitle={topClient ? `Top: ${topClient.name}` : 'No invoices yet'} value={money(rev.total, 'CAD', { cents: false })} detail={plural(rev.rows.length, 'client')} />
          <Row href={`/reports/cash-flow${q}`} icon={<IconTile color="#0680A2"><ArrowLeftRight /></IconTile>} title="Cash flow" subtitle="Money in vs out by month" value={money(cf.net, 'CAD', { cents: false, sign: true })} detail="net change" />
        </Section>
        <Section title="Spending & receivables" inset={58}>
          <Row href={`/reports/expenses${q}`} icon={<IconTile color="#E8833A"><PieChart /></IconTile>} title="Expenses by category" subtitle={topCat ? `Largest: ${topCat.name}` : 'No expenses yet'} value={money(pl.totalExpenses, 'CAD', { cents: false })} />
          <Row href={`/reports/spending${q}`} icon={<IconTile color="#D9467A"><Wallet /></IconTile>} title="Spending by owner & account" subtitle="Who spent it and what paid for it" />
          <Row href="/reports/ar-aging" icon={<IconTile color="#E0352B"><HandCoins /></IconTile>} title="AR aging" subtitle={`${plural(ar.open.length, 'open invoice')} today`} value={money(ar.total, 'CAD', { cents: false })} detail={ar.buckets.slice(1).some((b) => b.total) ? `${money(ar.buckets.slice(1).reduce((s, b) => s + b.total, 0), 'CAD', { cents: false })} overdue` : 'none overdue'} />
        </Section>
      </div>
      <p className="px-4 text-footnote text-label-3 lg:px-1">Every report exports to CSV. Amounts in CAD on the accrual basis unless noted.</p>
    </Page>
  );
}
