'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, Search, X } from 'lucide-react';
import { LinkSegmented } from '@/components/ui/segmented';
import { Menu } from '@/components/ui/menu';
import { clientsHref, SORTS, type ClientsQuery } from './query';

export function ClientsToolbar({ query, counts }: { query: ClientsQuery; counts: { active: number; owing: number; archived: number } }) {
  const router = useRouter();
  const [q, setQ] = useState(query.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(query);
  useEffect(() => { latest.current = query; }, [query]);

  function onSearch(next: string) {
    setQ(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(clientsHref({ ...latest.current, q: next.trim() }), { scroll: false }), 180);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sortLabel = SORTS.find((s) => s.value === query.sort)?.label ?? 'Name';

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
      <LinkSegmented
        id="clients-filter"
        full
        className="lg:w-auto lg:min-w-[300px]"
        value={query.filter}
        options={[
          { value: 'active', label: 'Active', count: counts.active, href: clientsHref({ ...query, filter: 'active' }) },
          { value: 'owing', label: 'Owing', count: counts.owing, href: clientsHref({ ...query, filter: 'owing' }) },
          { value: 'archived', label: 'Archived', count: counts.archived, href: clientsHref({ ...query, filter: 'archived' }) },
        ]}
      />
      <div className="flex items-center gap-2 lg:flex-1">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2 lg:h-7 lg:max-w-[320px] lg:rounded-[7px]">
          <Search className="size-4 shrink-0" strokeWidth={2.2} />
          <input
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onSearch('')}
            placeholder="Search name, contact, city"
            aria-label="Search clients"
            className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none lg:text-subhead [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => onSearch('')} className="pressable flex size-5 items-center justify-center rounded-full bg-label-3 text-bg">
              <X className="size-3" strokeWidth={3} />
            </button>
          )}
        </label>
        <Menu
          label="Sort clients"
          trigger={
            <button type="button" className="pressable flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-fill px-3 text-subhead font-medium text-label lg:h-7 lg:rounded-[7px] lg:px-2.5 lg:text-footnote">
              <ArrowUpDown className="size-4 text-label-2" strokeWidth={2.1} />
              <span className="hidden sm:inline">{sortLabel}</span>
            </button>
          }
          items={SORTS.filter((s) => s.menu).map((s) => ({
            label: s.label,
            href: clientsHref({ ...query, sort: s.value }),
            icon: s.value === query.sort ? <Check strokeWidth={2.4} className="text-accent-text" /> : undefined,
          }))}
        />
      </div>
    </div>
  );
}
