'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Search, X, Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

import { hrefWith } from './url';


/** Search field that keeps `?q=` in the URL (debounced, replace — no history spam). */
export function SearchBox({ base, params, placeholder = 'Search' }: { base: string; params: Record<string, string | undefined>; placeholder?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(params.q ?? '');
  const [pending, start] = useTransition();
  const first = useRef(true);
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; });
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => start(() => router.replace(hrefWith(base, paramsRef.current, { q: value.trim() || null }), { scroll: false })), 280);
    return () => clearTimeout(t);
  }, [value, base, router]);
  return (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2 lg:h-8 lg:max-w-[280px] lg:rounded-[8px]">
      {pending ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Search className="size-4 shrink-0" />}
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-3 lg:text-subhead [&::-webkit-search-cancel-button]:hidden"
        enterKeyHint="search"
      />
      {value && <button type="button" onClick={() => setValue('')} aria-label="Clear search" className="flex size-5 items-center justify-center rounded-full bg-label-3 text-bg"><X className="size-3" strokeWidth={3} /></button>}
    </label>
  );
}

export type FilterOption = { value: string; label: string; href: string; detail?: string; icon?: ReactNode; group?: string };

/**
 * A pill that shows the active value; tapping opens a sheet of choices (links).
 * Works for long lists (categories, months) where a pull-down menu would overflow.
 */
export function FilterPill({ label, title, options, value, clearHref }: {
  label: string; title?: string; options: FilterOption[]; value: string | undefined; clearHref: string;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-full pl-3 pr-2 text-subhead font-medium lg:h-7 lg:text-footnote',
          active ? 'bg-label text-bg' : 'bg-cell text-label shadow-card')}
      >
        {active ? active.label : label}
        <ChevronDown className="size-3.5 opacity-70" strokeWidth={2.6} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label} size="sm" fit cancelLabel="Close">
        <div className="pb-2">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              {g && <h3 className="mb-1.5 px-4 text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:px-1">{g}</h3>}
              <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '16px' }}>
                {!g || g === groups[0] ? (
                  <Link href={clearHref} scroll={false} replace onClick={() => setOpen(false)} className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                    <span className="flex-1">All</span>
                    {!active && <Check className="size-4 text-accent-text" strokeWidth={3} />}
                  </Link>
                ) : null}
                {options.filter((o) => (o.group ?? '') === g).map((o) => (
                  <Link key={o.value} href={o.href} scroll={false} replace onClick={() => setOpen(false)} className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                    {o.icon}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.detail && <span className="tabular text-footnote text-label-3">{o.detail}</span>}
                    {o.value === value && <Check className="size-4 text-accent-text" strokeWidth={3} />}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
