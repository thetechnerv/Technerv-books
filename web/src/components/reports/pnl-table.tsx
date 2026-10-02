'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

type Row = { key: string; name: string; gifi: string | null; months: number[]; total: number; parts?: Row[] };

/**
 * Profit & loss. Phones: one total column, tap a category to see its vendors /
 * clients. Desktop: a column per month with a sticky first column.
 */
export function PnlTable({ months, revenue, expense, revenueMonths, expenseMonths, netMonths, totals }: {
  months: { key: string; label: string; long: string }[]; revenue: Row[]; expense: Row[];
  revenueMonths: number[]; expenseMonths: number[]; netMonths: number[];
  totals: { revenue: number; expenses: number; net: number };
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const isOpen = (k: string) => allOpen || open.has(k);
  const showMonths = months.length > 1 && months.length <= 14;

  const cell = 'tabular px-2 py-2 text-right whitespace-nowrap';
  const monthCells = (vals: number[], cls = '') => showMonths ? vals.map((v, i) => <td key={i} className={cn(cell, 'hidden lg:table-cell', cls, !v && 'text-label-4')}>{v ? money(v, 'CAD', { cents: false }) : '–'}</td>) : null;

  const section = (title: string, rows: Row[], monthTotals: number[], total: number, prefix: string) => (
    <tbody>
      <tr className="bg-inset">
        <th colSpan={1} className="sticky left-0 z-[1] bg-inset px-4 py-2 text-left text-footnote font-semibold uppercase tracking-[0.04em] text-label-2 lg:px-3 lg:text-caption">{title}</th>
        {showMonths && months.map((m) => <th key={m.key} className="hidden bg-inset lg:table-cell" />)}
        <th className="bg-inset" />
      </tr>
      {rows.map((r) => (
        <FragmentRows key={prefix + r.key}>
          <tr className="hairline-t cursor-default hover:bg-fill-2" onClick={() => r.parts?.length && toggle(prefix + r.key)}>
            <td className="sticky left-0 z-[1] bg-cell px-4 py-2 lg:px-3">
              <button type="button" className="flex w-full min-w-0 items-center gap-1.5 text-left" aria-expanded={isOpen(prefix + r.key)} disabled={!r.parts?.length}>
                <ChevronRight className={cn('size-3.5 shrink-0 text-label-3 transition-transform', isOpen(prefix + r.key) && 'rotate-90', !r.parts?.length && 'invisible')} strokeWidth={2.6} />
                <span className="truncate">{r.name}</span>
                {r.gifi && <span className="tabular shrink-0 text-caption text-label-3">{r.gifi}</span>}
              </button>
            </td>
            {monthCells(r.months)}
            <td className={cn(cell, 'pr-4 font-medium lg:pr-3')}>{money(r.total)}</td>
          </tr>
          {isOpen(prefix + r.key) && r.parts?.map((p) => (
            <tr key={p.key} className="text-label-2">
              <td className="sticky left-0 z-[1] bg-cell py-1.5 pl-10 pr-4 text-subhead lg:pl-9 lg:text-footnote"><span className="block truncate">{p.name}</span></td>
              {monthCells(p.months, 'py-1.5 text-subhead lg:text-footnote')}
              <td className={cn(cell, 'py-1.5 pr-4 text-subhead lg:pr-3 lg:text-footnote')}>{money(p.total)}</td>
            </tr>
          ))}
        </FragmentRows>
      ))}
      <tr className="hairline-t font-semibold">
        <td className="sticky left-0 z-[1] bg-cell px-4 py-2 lg:px-3">Total {title.toLowerCase()}</td>
        {monthCells(monthTotals, 'font-semibold')}
        <td className={cn(cell, 'pr-4 lg:pr-3')}>{money(total)}</td>
      </tr>
    </tbody>
  );

  return (
    <div className="overflow-hidden rounded-group bg-cell shadow-card">
      <div className="flex items-center justify-end px-4 pt-2 lg:px-3">
        <button type="button" onClick={() => { setAllOpen((v) => !v); setOpen(new Set()); }} className="pressable text-footnote font-medium text-accent-text">
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-separate border-spacing-0 text-body lg:text-subhead">
          <thead>
            <tr className="text-footnote text-label-2 lg:text-caption">
              <th className="sticky left-0 z-[1] min-w-[180px] bg-cell px-4 py-2 text-left font-medium lg:min-w-[220px] lg:px-3">Category</th>
              {showMonths && months.map((m) => <th key={m.key} title={m.long} className="hidden px-2 py-2 text-right font-medium lg:table-cell">{m.label}</th>)}
              <th className="px-2 py-2 pr-4 text-right font-medium lg:pr-3">Total</th>
            </tr>
          </thead>
          {section('Revenue', revenue, revenueMonths, totals.revenue, 'r:')}
          {section('Expenses', expense, expenseMonths, totals.expenses, 'e:')}
          <tbody>
            <tr className="bg-inset text-headline font-semibold">
              <td className="sticky left-0 z-[1] bg-inset px-4 py-2.5 lg:px-3">Net income</td>
              {showMonths && netMonths.map((v, i) => <td key={i} className={cn(cell, 'hidden lg:table-cell', v < 0 && 'text-red')}>{money(v, 'CAD', { cents: false })}</td>)}
              <td className={cn(cell, 'pr-4 lg:pr-3', totals.net < 0 && 'text-red')}>{money(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
