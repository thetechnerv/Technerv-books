'use client';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

/*
  Report palette (categorical, fixed order). Validated with the dataviz
  validate_palette script, adjacent pairs, on #ffffff (light) and #111a1c (dark):
  light #0680a2, #d97a2e, #05a38c, #7c4ddb — worst CVD ΔE 11.6, normal 23.4, all ≥ 3:1
  dark  #2a98bd, #c96f28, #12a58c, #9479ec — worst CVD ΔE 12.1, normal 22.6, all ≥ 3:1
  Only used where segments sit next to each other (stacked bars), never all-pairs.
*/
export const REPORT_PALETTE_CSS = `
.rep-viz { --rep-1: #0680a2; --rep-2: #d97a2e; --rep-3: #05a38c; --rep-4: #7c4ddb; }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .rep-viz { --rep-1: #2a98bd; --rep-2: #c96f28; --rep-3: #12a58c; --rep-4: #9479ec; } }
:root[data-theme="dark"] .rep-viz { --rep-1: #2a98bd; --rep-2: #c96f28; --rep-3: #12a58c; --rep-4: #9479ec; }
`;
export const SERIES = ['var(--rep-1)', 'var(--rep-2)', 'var(--rep-3)', 'var(--rep-4)'];

export function ReportPalette() {
  return <style href="tn-report-palette" precedence="default">{REPORT_PALETTE_CSS}</style>;
}

export type HBarRow = { key: string; label: string; sublabel?: string; value: number; href?: string; segments?: Record<string, number> };
export type HBarSeries = { key: string; label: string; color: string };

/**
 * Horizontal bar chart: label on the left, thin bar (12px, 4px rounded data
 * end, square at the baseline), value at the tip. Stacked when `series` is
 * given (2px surface gap between segments, legend shown). Hover/focus shows a
 * tooltip; a visually-hidden table carries every value.
 */
export function HBarChart({ rows, color = 'var(--chart-out)', series, caption, currency = 'CAD', valueLabel = 'Amount' }: {
  rows: HBarRow[]; color?: string; series?: HBarSeries[]; caption: string; currency?: string; valueLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <figure className="rep-viz relative">
      <ReportPalette />
      {series && series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-footnote text-label-2 lg:px-3">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
      <div className="py-2" onPointerLeave={() => setHover(null)}>
        {rows.map((r) => {
          const w = (Math.max(0, r.value) / max) * 100;
          const share = total ? Math.round((r.value / total) * 1000) / 10 : 0;
          const body = (
            <div
              className={cn('relative grid grid-cols-[minmax(0,38%)_1fr] items-center gap-3 px-4 py-1.5 lg:grid-cols-[minmax(0,32%)_1fr] lg:px-3', r.href && 'row-press')}
              onPointerEnter={() => setHover(r.key)}
              onFocus={() => setHover(r.key)}
            >
              <div className="min-w-0">
                <div className="truncate text-subhead lg:text-footnote">{r.label}</div>
                {r.sublabel && <div className="truncate text-footnote text-label-3 lg:text-caption">{r.sublabel}</div>}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative flex h-3 min-w-0 flex-1 items-center">
                  <div className="flex h-3 gap-[2px]" style={{ width: `${w}%`, opacity: hover && hover !== r.key ? 0.45 : 1, transition: 'opacity 120ms' }}>
                    {series && r.segments ? (
                      series.map((s, i) => {
                        const v = r.segments![s.key] ?? 0;
                        if (v <= 0) return null;
                        const last = series.slice(i + 1).every((n) => (r.segments![n.key] ?? 0) <= 0);
                        return <div key={s.key} className={cn('h-full', last && 'rounded-r-[4px]')} style={{ flexGrow: v, flexBasis: 0, minWidth: 2, background: s.color }} />;
                      })
                    ) : (
                      <div className="h-full w-full rounded-r-[4px]" style={{ background: color, minWidth: r.value > 0 ? 2 : 0 }} />
                    )}
                  </div>
                  <span className="tabular ml-2 shrink-0 whitespace-nowrap text-footnote font-medium text-label lg:text-caption">{money(r.value, currency, { cents: false })}</span>
                </div>
              </div>
              {hover === r.key && (
                <div role="tooltip" className="material-thick pointer-events-none absolute right-4 top-0 z-10 min-w-[170px] -translate-y-[calc(100%-6px)] rounded-[12px] px-3 py-2 shadow-pop lg:right-3">
                  <div className="mb-1 text-footnote font-semibold">{r.label}</div>
                  {series && r.segments ? series.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-footnote">
                      <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
                      <span className="flex-1 text-label-2">{s.label}</span>
                      <span className="tabular font-medium">{money(r.segments![s.key] ?? 0, currency)}</span>
                    </div>
                  )) : (
                    <div className="flex gap-3 text-footnote"><span className="flex-1 text-label-2">{valueLabel}</span><span className="tabular font-medium">{money(r.value, currency)}</span></div>
                  )}
                  <div className="flex gap-3 text-footnote"><span className="flex-1 text-label-2">Share</span><span className="tabular font-medium">{share}%</span></div>
                </div>
              )}
            </div>
          );
          return r.href ? <Link key={r.key} href={r.href} className="block">{body}</Link> : <div key={r.key}>{body}</div>;
        })}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th>Item</th>{series ? series.map((s) => <th key={s.key}>{s.label}</th>) : null}<th>{valueLabel}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td>{series ? series.map((s) => <td key={s.key}>{money(r.segments?.[s.key] ?? 0, currency)}</td>) : null}<td>{money(r.value, currency)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** One 100% stacked bar showing composition, with legend + values (identity never by colour alone). */
/**
 * Parts keep the order they're given (pass a stable order, e.g. the account list),
 * so colour follows the entity, not its rank. More than four fold into "Other".
 */
export function ShareBar({ parts, caption, currency = 'CAD' }: { parts: { key: string; label: string; value: number }[]; caption: string; currency?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = foldToFour(parts);
  const total = shown.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <figure className="rep-viz px-4 py-3 lg:px-3">
      <ReportPalette />
      <div className="flex h-3 w-full gap-[2px] overflow-visible" onPointerLeave={() => setHover(null)}>
        {shown.map((p, i) => (
          <div key={p.key} onPointerEnter={() => setHover(p.key)} title={`${p.label}: ${money(p.value, currency)}`}
            className={cn('h-full', i === 0 && 'rounded-l-[4px]', i === shown.length - 1 && 'rounded-r-[4px]')}
            style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3, background: SERIES[i], opacity: hover && hover !== p.key ? 0.45 : 1 }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-footnote sm:grid-cols-2">
        {shown.map((p, i) => (
          <li key={p.key} className="flex items-center gap-2" onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)}>
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[i] }} />
            <span className="min-w-0 flex-1 truncate text-label-2">{p.label}</span>
            <span className="tabular font-medium">{money(p.value, currency, { cents: false })}</span>
            <span className="tabular w-11 text-right text-label-3">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <table className="sr-only"><caption>{caption}</caption><tbody>{shown.map((p) => <tr key={p.key}><td>{p.label}</td><td>{money(p.value, currency)}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** A 5th+ category never gets a generated hue — it folds into "Other". */
function foldToFour<T extends { key: string; label: string; value: number }>(parts: T[]) {
  if (parts.length <= 4) return parts;
  const rest = parts.slice(3);
  return [...parts.slice(0, 3), { key: 'other', label: `Other (${rest.length})`, value: rest.reduce((s, p) => s + p.value, 0) }];
}
