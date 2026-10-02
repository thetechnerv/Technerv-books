import { Section, Card } from '@/components/ui/group';
import { BigMoney } from '@/components/ui/money';
import { BarChart } from '@/components/charts/bar-chart';
import { ReportFrame } from '@/components/reports/report-frame';
import { PnlTable } from '@/components/reports/pnl-table';
import { profitAndLoss } from '@/components/reports/data';
import { periodFromParams } from '@/components/tax/books';
import { currentMember } from '@/lib/session';
import { money } from '@/lib/format';

export const metadata = { title: 'Profit & loss' };

export default async function ProfitLoss({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams(await searchParams);
  const pl = await profitAndLoss(period);
  const margin = pl.totalRevenue ? Math.round((pl.net / pl.totalRevenue) * 100) : 0;

  return (
    <ReportFrame title="Profit & loss" report="profit-loss" period={period} years={ctx.years}>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card><div className="text-footnote text-label-2">Revenue</div><BigMoney value={pl.totalRevenue} className="text-title2" /></Card>
        <Card><div className="text-footnote text-label-2">Expenses</div><BigMoney value={pl.totalExpenses} className="text-title2" /></Card>
        <Card><div className="text-footnote text-label-2">Net income · {margin}%</div><BigMoney value={pl.net} className={`text-title2 ${pl.net < 0 ? 'text-red' : ''}`} /></Card>
      </div>

      {pl.months.length > 1 && (
        <Section title="By month">
          <div className="p-4">
            <BarChart
              caption="Revenue and expenses by month"
              series={[{ key: 'in', label: 'Revenue', color: 'var(--chart-in)' }, { key: 'out', label: 'Expenses', color: 'var(--chart-out)' }]}
              data={pl.months.map((m, i) => ({ label: m.label, sublabel: m.long, values: { in: Math.max(0, pl.revenueMonths[i]!), out: Math.max(0, pl.expenseMonths[i]!) } }))}
            />
          </div>
        </Section>
      )}

      <PnlTable
        months={pl.months} revenue={pl.revenue} expense={pl.expense}
        revenueMonths={pl.revenueMonths} expenseMonths={pl.expenseMonths} netMonths={pl.netMonths}
        totals={{ revenue: pl.totalRevenue, expenses: pl.totalExpenses, net: pl.net }}
      />
      <p className="mt-2 px-4 text-footnote text-label-2 lg:px-1">
        Accrual basis. Revenue is before GST/HST, credit notes netted; expenses are the business share less ITCs.
        {pl.capital ? ` Capital purchases (${money(pl.capital)}) are not expensed — see CCA in the year-end package.` : ''} Tap a category to see who it&apos;s from.
      </p>
    </ReportFrame>
  );
}
