import Link from 'next/link';
import type { ReactNode } from 'react';
import { BigMoney } from '@/components/ui/money';
import { cn } from '@/lib/cn';

export type Stat = { label: string; value: number; sub?: ReactNode; tone?: 'red' | 'default'; href?: string; /** Show this instead of a money amount. */ text?: string };

/** Three headline numbers above a list. Scrolls sideways on phones. */
export function SummaryStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {stats.map((s) => {
        const body = (
          <div className="h-full rounded-group bg-cell p-4 shadow-card lg:p-4">
            <div className={cn('text-footnote font-medium', s.tone === 'red' && s.value > 0 ? 'text-red' : 'text-label-2')}>{s.label}</div>
            {s.text !== undefined ? <span className="tabular mt-1 block font-display text-title2 font-semibold tracking-[-0.03em]">{s.text}</span> : <BigMoney value={s.value} className={cn('mt-1 block text-title2', s.tone === 'red' && s.value > 0 && 'text-red')} />}
            {s.sub && <div className="mt-0.5 truncate text-footnote text-label-3">{s.sub}</div>}
          </div>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} scroll={false} className="pressable w-[68%] max-w-[260px] shrink-0 snap-start lg:w-auto lg:max-w-none">{body}</Link>
        ) : (
          <div key={s.label} className="w-[68%] max-w-[260px] shrink-0 snap-start lg:w-auto lg:max-w-none">{body}</div>
        );
      })}
    </div>
  );
}

/** Small pill links, e.g. overdue age buckets. */
export function FilterChips({ items }: { items: { label: string; href: string; active?: boolean; count?: number }[] }) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
      {items.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          scroll={false}
          replace
          className={cn('pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead font-medium lg:h-7 lg:text-footnote',
            c.active ? 'bg-label text-bg' : 'bg-cell text-label shadow-card')}
        >
          {c.label}
          {c.count !== undefined && <span className={cn('tabular text-caption', c.active ? 'text-bg/70' : 'text-label-3')}>{c.count}</span>}
        </Link>
      ))}
    </div>
  );
}
