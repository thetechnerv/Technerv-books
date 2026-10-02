'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, XCircle } from 'lucide-react';

/** URL-driven search field (?q=) that updates as you type. */
export function SearchBox({ defaultValue, placeholder, hidden = {} }: { defaultValue: string; placeholder: string; hidden?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [v, setV] = useState(defaultValue);
  const first = useRef(true);
  const extra = JSON.stringify(hidden);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const params = new URLSearchParams(Object.entries(JSON.parse(extra) as Record<string, string>).filter(([, x]) => x));
      if (v.trim()) params.set('q', v.trim());
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 280);
    return () => clearTimeout(t);
  }, [v, extra, pathname, router]);

  return (
    <form role="search" className="relative flex-1 lg:max-w-xs" onSubmit={(e) => e.preventDefault()}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
      <input
        type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="h-9 w-full rounded-[10px] bg-fill pl-8 pr-8 text-body outline-none placeholder:text-label-3 lg:h-7 lg:rounded-[7px] lg:text-subhead [&::-webkit-search-cancel-button]:hidden"
      />
      {v && (
        <button type="button" aria-label="Clear search" onClick={() => setV('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-label-3">
          <XCircle className="size-4" />
        </button>
      )}
    </form>
  );
}
