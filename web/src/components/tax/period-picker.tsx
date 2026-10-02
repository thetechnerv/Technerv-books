'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { LinkSegmented } from '@/components/ui/segmented';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Section } from '@/components/ui/group';
import { Input } from '@/components/ui/fields';
import { cn } from '@/lib/cn';

type Props = {
  path: string;
  years: number[];
  /** Selected fiscal year, or null when a custom range is active. */
  fy: number | null;
  from?: string;
  to?: string;
  /** Other query params to keep (e.g. tab=…). */
  keep?: Record<string, string | undefined>;
  custom?: boolean;
  className?: string;
};

function qs(params: Record<string, string | undefined>) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
  return s ? `?${s}` : '';
}

/** Fiscal-year segmented control, plus an optional custom date range. */
export function PeriodPicker({ path, years, fy, from, to, keep = {}, custom, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from: from ?? '', to: to ?? '' });
  const options = years.map((y) => ({ value: String(y), label: `FY${y}`, href: `${path}${qs({ ...keep, fy: String(y) })}` }));
  const valid = range.from && range.to && range.from <= range.to;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LinkSegmented id={`fy-${path}`} options={options} value={fy ? String(fy) : ''} />
      {custom && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn('pressable inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-subhead font-medium lg:h-7 lg:rounded-[7px] lg:text-footnote',
              fy ? 'bg-fill text-label-2' : 'bg-label text-bg')}
          >
            <CalendarRange className="size-4" />
            <span className="hidden sm:inline">Custom</span>
          </button>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title="Custom range"
            size="sm"
            fit
            action={<SheetAction disabled={!valid} onClick={() => { setOpen(false); router.push(`${path}${qs({ ...keep, from: range.from, to: range.to })}`); }}>Apply</SheetAction>}
          >
            <form onSubmit={(e) => { e.preventDefault(); if (valid) { setOpen(false); router.push(`${path}${qs({ ...keep, from: range.from, to: range.to })}`); } }}>
              <Section className="mt-2" footer="Both dates are included.">
                <Input label="From" type="date" name="from" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} align="right" />
                <Input label="To" type="date" name="to" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} align="right" />
              </Section>
              <button type="submit" hidden />
            </form>
          </Sheet>
        </>
      )}
    </div>
  );
}
