import { HandCoins } from 'lucide-react';
import { Section, Card, Row } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { BigMoney } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/empty';
import { ReportFrame } from '@/components/reports/report-frame';
import { HBarChart } from '@/components/reports/hbar-chart';
import { arAging } from '@/components/reports/data';
import { periodFromParams } from '@/components/tax/books';
import { isIsoDate } from '@/components/tax/period';
import { currentMember } from '@/lib/session';
import { date, isoToday, money, plural } from '@/lib/format';

export const metadata = { title: 'AR aging' };

/**
 * Receivables aging as at a date: today by default, or the end of the selected
 * fiscal year / custom range (`?asof=` overrides both).
 */
export default async function ArAging({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string; asof?: string }> }) {
  await currentMember();
  const sp = await searchParams;
  const { ctx, period } = await periodFromParams(sp);
  const today = isoToday();
  const asOf = isIsoDate(sp.asof) ? sp.asof : (sp.fy || sp.from) && period.end < today ? period.end : today;
  const ar = await arAging(asOf);
  const overdue = ar.buckets.slice(1).reduce((s, b) => s + b.total, 0);

  return (
    <ReportFrame
      title="Accounts receivable aging" report="ar-aging" period={period} years={ctx.years}
      subtitle={`As at ${date(asOf)}`}
      exportQuery={`asof=${asOf}`}
      toolbarExtra={asOf !== today ? <a href="/reports/ar-aging" className="text-footnote font-medium text-accent-text">Show today</a> : undefined}
    >
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card><div className="text-footnote text-label-2">Outstanding</div><BigMoney value={ar.total} className="text-title2" /><div className="text-footnote text-label-3">{plural(ar.open.length, 'invoice')}</div></Card>
        <Card><div className="text-footnote text-label-2">Overdue</div><BigMoney value={overdue} className={`text-title2 ${overdue ? 'text-red' : ''}`} /><div className="text-footnote text-label-3">{ar.total ? Math.round((overdue / ar.total) * 100) : 0}% of outstanding</div></Card>
      </div>
      {!ar.open.length ? (
        <EmptyState icon={<HandCoins />} title="Nothing outstanding" message={`Every invoice issued by ${date(asOf)} was paid by then.`} />
      ) : (
        <>
          <Section title="By days past due" footer="Days past the invoice due date. Invoices issued by the date, less payments received by then. CAD at the invoice rate.">
            <HBarChart color="var(--chart-in)" caption="Receivables by age" valueLabel="Outstanding" rows={ar.buckets.map((b) => ({ key: b.key, label: b.label, sublabel: plural(b.items.length, 'invoice'), value: b.total }))} />
          </Section>
          {ar.buckets.filter((b) => b.items.length).map((b) => (
            <Section key={b.key} title={`${b.label} · ${money(b.total)}`}>
              {b.items.map((i) => (
                <Row key={i.id} href={`/invoices/${i.id}`}
                  title={<span className="flex items-center gap-2"><span className="truncate">{i.client}</span>{i.daysOverdue > 60 && <Badge tone="red">{i.daysOverdue} days</Badge>}</span>}
                  subtitle={`${i.number} · due ${date(i.due_date)}${i.daysOverdue ? ` · ${i.daysOverdue} days late` : ''}`}
                  value={money(i.balance, i.currency)} detail={i.currency !== 'CAD' ? money(i.balanceCad) : undefined} />
              ))}
            </Section>
          ))}
        </>
      )}
    </ReportFrame>
  );
}
