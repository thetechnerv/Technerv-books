import { Section, Card } from '@/components/ui/group';
import { BigMoney } from '@/components/ui/money';
import { BarChart } from '@/components/charts/bar-chart';
import { ReportFrame } from '@/components/reports/report-frame';
import { cashFlow } from '@/components/reports/data';
import { periodFromParams } from '@/components/tax/books';
import { currentMember } from '@/lib/session';
import { money, plural } from '@/lib/format';

export const metadata = { title: 'Cash flow' };

export default async function CashFlow({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams(await searchParams);
  const cf = await cashFlow(period);

  return (
    <ReportFrame title="Cash flow" report="cash-flow" period={period} years={ctx.years}>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card><div className="text-footnote text-label-2">Money in</div><BigMoney value={cf.totalIn} className="text-title2" /></Card>
        <Card><div className="text-footnote text-label-2">Money out</div><BigMoney value={cf.totalOut} className="text-title2" /></Card>
        <Card><div className="text-footnote text-label-2">Net change</div><BigMoney value={cf.net} className={`text-title2 ${cf.net < 0 ? 'text-red' : ''}`} /></Card>
      </div>
      <Section title="In vs out by month" footer={`From the bank and card feeds (${cf.accounts.join(', ')}), in CAD. ${cf.internal ? `${plural(cf.internal, 'transfer')} between your own accounts (like paying the card) are left out.` : ''}`}>
        <div className="p-4">
          <BarChart
            caption="Money in and out by month"
            series={[{ key: 'in', label: 'Money in', color: 'var(--chart-in)' }, { key: 'out', label: 'Money out', color: 'var(--chart-out)' }]}
            data={cf.rows.map((m) => ({ label: m.label, sublabel: m.long, values: { in: m.in, out: m.out } }))}
          />
        </div>
      </Section>
      <Section title="Months">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body lg:text-subhead">
            <thead className="text-footnote text-label-2 lg:text-caption">
              <tr><th className="px-4 py-2 font-medium lg:px-3">Month</th><th className="px-2 py-2 text-right font-medium">In</th><th className="px-2 py-2 text-right font-medium">Out</th><th className="px-4 py-2 text-right font-medium lg:px-3">Net</th></tr>
            </thead>
            <tbody className="tabular">
              {cf.rows.map((m) => (
                <tr key={m.key} className="hairline-t">
                  <td className="px-4 py-2 lg:px-3">{m.long}</td>
                  <td className="px-2 py-2 text-right">{money(m.in, 'CAD', { cents: false })}</td>
                  <td className="px-2 py-2 text-right">{money(m.out, 'CAD', { cents: false })}</td>
                  <td className={`px-4 py-2 text-right font-medium lg:px-3 ${m.net < 0 ? 'text-red' : ''}`}>{money(m.net, 'CAD', { cents: false, sign: true })}</td>
                </tr>
              ))}
              <tr className="hairline-t bg-inset font-semibold">
                <td className="px-4 py-2 lg:px-3">Total</td>
                <td className="px-2 py-2 text-right">{money(cf.totalIn, 'CAD', { cents: false })}</td>
                <td className="px-2 py-2 text-right">{money(cf.totalOut, 'CAD', { cents: false })}</td>
                <td className={`px-4 py-2 text-right lg:px-3 ${cf.net < 0 ? 'text-red' : ''}`}>{money(cf.net, 'CAD', { cents: false, sign: true })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </ReportFrame>
  );
}
