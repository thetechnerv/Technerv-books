import { ChevronRight, Receipt } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { EmptyState } from '@/components/ui/empty';
import { ReportFrame } from '@/components/reports/report-frame';
import { HBarChart } from '@/components/reports/hbar-chart';
import { DrillSheet } from '@/components/tax/drill-sheet';
import { expensesByCategory } from '@/components/reports/data';
import { periodFromParams } from '@/components/tax/books';
import { currentMember } from '@/lib/session';
import { money, plural } from '@/lib/format';

export const metadata = { title: 'Expenses by category' };

export default async function ExpensesReport({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams(await searchParams);
  const r = await expensesByCategory(period);

  return (
    <ReportFrame title="Expenses by category" report="expenses" period={period} years={ctx.years}>
      {!r.rows.length ? (
        <EmptyState icon={<Receipt />} title="No expenses in this period" message="Pick another year or a custom range." />
      ) : (
        <>
          <Section title={`Business spending · ${money(r.total)}`} footer="Business share of each expense less the GST/HST you claim back. Capital purchases are excluded.">
            <HBarChart caption="Business expenses by category" rows={r.rows.map((x) => ({ key: x.name, label: x.name, sublabel: x.gifi ? `GIFI ${x.gifi}` : undefined, value: x.amount }))} />
          </Section>
          <Section title="Categories">
            {r.rows.map((x) => (
              <DrillSheet key={x.name} title={x.name} summary={`${plural(x.vendors.length, 'vendor')} · ${money(x.amount)}`}
                rows={x.vendors.map((v) => ({ id: v.key, title: v.name, amount: v.total }))} total={x.amount}>
                <span className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                  <span className="min-w-0 flex-1 py-[11px] lg:py-2">
                    <span className="block truncate">{x.name}</span>
                    <span className="mt-0.5 block text-subhead text-label-2 lg:text-footnote">{x.gifi ? `GIFI ${x.gifi} · ` : ''}{plural(x.vendors.length, 'vendor')} · {Math.round((x.amount / (r.total || 1)) * 100)}%</span>
                  </span>
                  <span className="tabular">{money(x.amount)}</span>
                  <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
                </span>
              </DrillSheet>
            ))}
            {r.capital > 0 && (
              <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 text-label-2 lg:px-3">
                <span className="flex-1">Capital purchases (not expensed)</span><span className="tabular">{money(r.capital)}</span>
              </div>
            )}
          </Section>
        </>
      )}
    </ReportFrame>
  );
}
