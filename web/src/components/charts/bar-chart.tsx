'use client';
import { useMemo, useRef, useState } from 'react';
import { money } from '@/lib/format';

export type BarSeries = { key: string; label: string; color: string };
export type BarDatum = { label: string; sublabel?: string; values: Record<string, number> };

/**
 * Grouped column chart. Thin columns (≤ 24px), 4px rounded tops anchored to a
 * single baseline, 2px gaps between neighbours, hairline grid, hover/touch
 * tooltip per group, legend for identity, and a visually-hidden table.
 */
export function BarChart({ data, series, height = 200, currency = 'CAD', caption }: { data: BarDatum[]; series: BarSeries[]; height?: number; currency?: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => {
    const m = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
    const step = niceStep(m / 3);
    return Math.ceil(m / step) * step;
  }, [data, series]);
  const ticks = [0, max / 3, (2 * max) / 3, max];

  const W = 100; // percentage space; bars positioned with % so the chart is fluid
  const group = W / data.length;

  return (
    <figure className="relative" ref={ref}>
      {/* legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-label-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex">
        {/* y ticks */}
        <div className="relative mr-2 w-10 shrink-0 text-right text-caption2 text-label-3" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="tabular absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {money(t, currency, { compact: true })}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px" style={{ top: `${100 - (t / max) * 100}%`, background: t === 0 ? 'var(--separator-strong)' : 'var(--chart-grid)' }} />
          ))}
          {data.map((d, i) => (
            <div
              key={d.label + i}
              className="absolute inset-y-0 flex items-end justify-center gap-[2px]"
              style={{ left: `${i * group}%`, width: `${group}%` }}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            >
              {hover === i && <div className="absolute inset-y-0 inset-x-[8%] rounded-[6px] bg-fill-2" />}
              {series.map((s) => {
                const v = Math.max(0, d.values[s.key] ?? 0);
                return (
                  <div
                    key={s.key}
                    className="relative rounded-t-[4px] transition-[height] duration-500 ease-out"
                    style={{ height: `${(v / max) * 100}%`, width: `min(24px, ${70 / series.length}%)`, background: s.color, minHeight: v > 0 ? 2 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }}
                  />
                );
              })}
            </div>
          ))}
          {hover !== null && data[hover] && (
            <div
              className="material-thick pointer-events-none absolute -top-2 z-10 min-w-[150px] -translate-y-full rounded-[12px] px-3 py-2 shadow-pop"
              style={{ left: `clamp(0px, calc(${(hover + 0.5) * group}% - 75px), calc(100% - 150px))` }}
            >
              <div className="mb-1 text-footnote font-semibold">{data[hover].sublabel ?? data[hover].label}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-footnote">
                  <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                  <span className="flex-1 text-label-2">{s.label}</span>
                  <span className="tabular font-medium">{money(data[hover]!.values[s.key] ?? 0, currency, { cents: false })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* x labels */}
      <div className="ml-12 mt-1.5 flex text-caption2 text-label-3">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center" style={{ visibility: data.length > 8 && i % 2 === 1 && i !== data.length - 1 ? 'hidden' : 'visible' }}>{d.label}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th>Period</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{d.sublabel ?? d.label}</td>{series.map((s) => <td key={s.key}>{money(d.values[s.key] ?? 0, currency)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
