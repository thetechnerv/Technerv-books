import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { PeriodPicker } from '@/components/tax/period-picker';
import { periodLong, type Period } from '@/components/tax/period';

export type ReportKey = 'profit-loss' | 'expenses' | 'spending' | 'revenue' | 'ar-aging' | 'cash-flow';

export function periodQuery(p: Period & { custom?: boolean }) {
  return p.custom || !p.fy ? `from=${p.start}&to=${p.end}` : `fy=${p.fy}`;
}

/** Shared scaffold for a report: back to Reports, period picker, CSV export. */
export function ReportFrame({ title, report, period, years, children, toolbarExtra, exportQuery, subtitle }: {
  title: string; report: ReportKey; period: Period & { custom?: boolean }; years: number[]; children: ReactNode;
  toolbarExtra?: ReactNode; exportQuery?: string; subtitle?: string;
}) {
  const q = exportQuery ?? periodQuery(period);
  return (
    <Page
      title={title}
      subtitle={subtitle ?? periodLong(period)}
      back={{ href: `/reports${period.fy && !period.custom ? `?fy=${period.fy}` : ''}`, label: 'Reports' }}
      wide={report === 'profit-loss'}
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PeriodPicker path={`/reports/${report}`} years={years} fy={period.custom ? null : period.fy} from={period.custom ? period.start : undefined} to={period.custom ? period.end : undefined} custom />
          {toolbarExtra}
        </div>
      }
      actions={
        <a href={`/api/exports/${report}?${q}`} download className="pressable inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-subhead font-semibold text-accent-text lg:h-7 lg:text-footnote">
          <Download className="size-4" />CSV
        </a>
      }
    >
      {children}
    </Page>
  );
}
