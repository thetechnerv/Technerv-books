import { ChevronRight, Users } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { EmptyState } from '@/components/ui/empty';
import { ReportFrame } from '@/components/reports/report-frame';
import { HBarChart } from '@/components/reports/hbar-chart';
import { DrillSheet } from '@/components/tax/drill-sheet';
import { revenueByClient } from '@/components/reports/data';
import { periodFromParams } from '@/components/tax/books';
import { currentMember } from '@/lib/session';
import { date, money, plural } from '@/lib/format';

export const metadata = { title: 'Revenue by client' };

export default async function RevenueReport({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams(await searchParams);
  const r = await revenueByClient(period);

  return (
    <ReportFrame title="Revenue by client" report="revenue" period={period} years={ctx.years}>
      {!r.rows.length ? (
        <EmptyState icon={<Users />} title="No invoices in this period" message="Issued invoices show up here (drafts don't count)." />
      ) : (
        <>
          <Section title={`Net sales · ${money(r.total)}`} footer="Invoices issued in the period, before GST/HST, credit notes netted. USD invoices at their invoice-date rate.">
            <HBarChart color="var(--chart-in)" caption="Revenue by client" valueLabel="Net sales" rows={r.rows.map((c) => ({ key: c.id, label: c.name, sublabel: plural(c.count, 'invoice'), value: c.net, href: `/clients/${c.id}` }))} />
          </Section>
          <Section title="Clients">
            {r.rows.map((c) => (
              <DrillSheet key={c.id} title={c.name} summary={`${plural(c.count, 'document')} · ${money(c.net)} before tax · ${money(c.tax)} tax`}
                rows={c.docs.map((d) => ({ id: d.id, href: `/invoices/${d.id}`, title: d.number, subtitle: `${date(d.issue_date)} · ${d.status}${d.currency !== 'CAD' ? ` · ${money(d.total, d.currency)}` : ''}`, amount: d.netCad, badge: d.kind === 'credit_note' ? { label: 'Credit note', tone: 'purple' } : undefined }))}
                total={c.net}>
                <span className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                  <span className="min-w-0 flex-1 py-[11px] lg:py-2">
                    <span className="block truncate">{c.name}</span>
                    <span className="mt-0.5 block text-subhead text-label-2 lg:text-footnote">{plural(c.count, 'invoice')} · {Math.round((c.net / (r.total || 1)) * 100)}%{c.currency.includes('USD') ? ' · USD' : ''}</span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="tabular">{money(c.net)}</span>
                    {c.open > 0 && <span className="tabular text-footnote text-orange">{money(c.open, 'CAD', { cents: false })} open</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
                </span>
              </DrillSheet>
            ))}
          </Section>
        </>
      )}
    </ReportFrame>
  );
}
