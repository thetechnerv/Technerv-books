'use client';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { CopyButton } from './copy-button';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { saveWorksheet } from '@/app/(app)/tax/actions';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

type Editable = 'l104' | 'l107' | 'l110' | 'l111' | 'l205' | 'l405';
type Base = { l101: number; l103: number; l106: number; /** Fixed part of 107 (quick-method 1% credit). */ l107Base?: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const parse = (s: string) => { const n = Number(s.replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
/** CRA wants whole dollars on line 101 and dollars-and-cents elsewhere, no symbols or separators. */
const plain = (n: number, whole = false) => (whole ? String(Math.round(n)) : n.toFixed(2));

/**
 * GST34 worksheet. Lines the books can't know (adjustments, instalments,
 * rebates, self-assessed tax) are typed in; every total recalculates live.
 */
export function GstWorksheet({ base, initial, period, locked, quick, hints }: {
  base: Base; initial: Partial<Record<Editable, number>>; period: { start: string; end: string; due: string | null }; locked: boolean; quick: boolean;
  hints: Partial<Record<string, ReactNode>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<Editable, string>>(() => ({
    l104: fmt(initial.l104), l107: fmt(initial.l107), l110: fmt(initial.l110), l111: fmt(initial.l111), l205: fmt(initial.l205), l405: fmt(initial.l405),
  }));
  const dirty = (Object.keys(v) as Editable[]).some((k) => parse(v[k]) !== (initial[k] ?? 0));

  const L = useMemo(() => {
    const l104 = parse(v.l104), l107 = r2(parse(v.l107) + (base.l107Base ?? 0)), l110 = parse(v.l110), l111 = parse(v.l111), l205 = parse(v.l205), l405 = parse(v.l405);
    const l105 = r2(base.l103 + l104);
    const l108 = r2(base.l106 + l107);
    const l109 = r2(l105 - l108);
    const l112 = r2(l110 + l111);
    const l113A = r2(l109 - l112);
    const l113B = r2(l205 + l405);
    const l113C = r2(l113A + l113B);
    return { l101: base.l101, l103: base.l103, l104, l105, l106: base.l106, l107, l108, l109, l110, l111, l112, l113A, l205, l405, l113B, l113C };
  }, [v, base]);

  function save() {
    start(async () => {
      const r = await saveWorksheet({ period_start: period.start, period_end: period.end, due_on: period.due, values: Object.fromEntries((Object.keys(v) as Editable[]).map((k) => [k, String(parse(v[k]))])) });
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({ title: 'Worksheet saved' });
      router.refresh();
    });
  }

  const input = (k: Editable, label: string) => (
    <input
      aria-label={label}
      inputMode="decimal"
      disabled={locked}
      value={v[k]}
      placeholder="0.00"
      onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value.replace(/[^\d.\-]/g, '') }))}
      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
      className="tabular h-9 w-[8.5rem] rounded-[8px] bg-fill px-2.5 text-right text-body outline-none focus:bg-fill-3 disabled:bg-transparent lg:h-7 lg:w-32 lg:text-subhead"
    />
  );

  const rows: { line: string; label: string; value: number; edit?: Editable; total?: boolean; whole?: boolean; strong?: boolean; sub?: boolean }[] = [
    { line: '101', label: quick ? 'Sales subject to the quick method (incl. GST/HST)' : 'Sales and other revenue', value: L.l101, whole: true },
    { line: '103', label: quick ? 'GST/HST at quick-method remittance rates' : 'GST/HST collected or collectible', value: L.l103 },
    { line: '104', label: 'Adjustments', value: L.l104, edit: 'l104' },
    { line: '105', label: 'Total GST/HST and adjustments', value: L.l105, total: true },
    { line: '106', label: quick ? 'ITCs on capital purchases' : 'Input tax credits (ITCs)', value: L.l106 },
    { line: '107', label: quick ? 'Adjustments (incl. 1% credit)' : 'Adjustments', value: L.l107, edit: 'l107' },
    { line: '108', label: 'Total ITCs and adjustments', value: L.l108, total: true },
    { line: '109', label: 'Net tax', value: L.l109, total: true, strong: true },
    { line: '110', label: 'Instalments paid', value: L.l110, edit: 'l110' },
    { line: '111', label: 'Rebates', value: L.l111, edit: 'l111' },
    { line: '112', label: 'Total other credits', value: L.l112, total: true },
    { line: '113A', label: 'Balance', value: L.l113A, total: true },
    { line: '205', label: 'GST/HST due on purchases of real property', value: L.l205, edit: 'l205', sub: true },
    { line: '405', label: 'Other GST/HST to be self-assessed', value: L.l405, edit: 'l405', sub: true },
    { line: '113B', label: 'Total other debits', value: L.l113B, total: true },
    { line: '113C', label: 'Balance', value: L.l113C, total: true, strong: true },
  ];

  return (
    <div>
      <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '16px' }}>
        {rows.map((r) => (
          <div key={r.line} className={cn('flex min-h-[var(--row-h)] items-center gap-3 px-4 py-1.5 lg:px-3', r.total && 'bg-inset')}>
            <span className={cn('tabular inline-flex h-6 min-w-[44px] shrink-0 items-center justify-center rounded-[6px] text-footnote font-semibold lg:h-5 lg:min-w-[40px] lg:text-caption', r.strong ? 'bg-label text-bg' : 'bg-fill text-label-2')}>
              {r.line}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block', r.strong && 'font-semibold', r.sub && 'text-label-2')}>{r.label}</span>
              {hints[r.line] && <span className="mt-0.5 block text-footnote text-label-3">{hints[r.line]}</span>}
            </span>
            {r.edit && !locked ? input(r.edit, `Line ${r.line}`) : (
              <span className={cn('tabular shrink-0 text-right', r.strong ? 'text-headline font-semibold' : 'text-label')}>{r.whole ? money(r.value, 'CAD', { cents: false }) : money(r.value)}</span>
            )}
            <CopyButton value={plain(r.value, r.whole)} label={`line ${r.line}`} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-footnote text-label-2">
          {L.l113C > 0 ? <>Line 115 · amount owing <b className="tabular text-label">{money(L.l113C)}</b></> : L.l113C < 0 ? <>Line 114 · refund claimed <b className="tabular text-label">{money(-L.l113C)}</b></> : 'Nothing owing.'}
        </p>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-footnote text-label-2"><Lock className="size-3.5" />Filed — read only</span>
        ) : (
          <Button variant={dirty ? 'filled' : 'gray'} size="sm" disabled={!dirty} loading={pending} onClick={save}>Save worksheet</Button>
        )}
      </div>
    </div>
  );
}

function fmt(n: number | undefined) { return n ? String(n) : ''; }
