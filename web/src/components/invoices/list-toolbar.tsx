'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Copy, FilePlus2, Plus, ReceiptText, Repeat, Search, X, ClipboardList } from 'lucide-react';
import { LinkSegmented } from '@/components/ui/segmented';
import { Menu } from '@/components/ui/menu';
import { Sheet } from '@/components/ui/sheet';
import { IconButton, Button } from '@/components/ui/button';
import { money, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ClientTile } from './client-tile';

/** Search box that keeps `?q=` in the URL. Press "/" to focus on desktop. */
export function ListSearch({ placeholder = 'Search' }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q.trim()) next.set('q', q.trim()); else next.delete('q');
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2 lg:h-8 lg:max-w-[280px] lg:rounded-md">
      <Search className="size-4 shrink-0" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (setQ(''), (e.target as HTMLInputElement).blur())}
        placeholder={placeholder}
        type="search"
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-3 lg:text-subhead [&::-webkit-search-cancel-button]:hidden"
      />
      {q ? (
        <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="rounded-full p-0.5 text-label-3 hover:text-label"><X className="size-4" /></button>
      ) : (
        <kbd className="hidden rounded border border-separator px-1 font-sans text-caption2 text-label-3 lg:inline">/</kbd>
      )}
    </label>
  );
}

export type SegmentOpt = { value: string; label: string; href: string; count?: number };

export function ListToolbar({ options, value, searchPlaceholder, trailing, id }: { options: SegmentOpt[]; value: string; searchPlaceholder: string; trailing?: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-2 lg:h-8 lg:flex-row lg:items-center lg:gap-3">
      <LinkSegmented id={id} options={options} value={value} className="lg:shrink-0" />
      <div className="flex items-center gap-2 lg:flex-1 lg:justify-end">
        <ListSearch placeholder={searchPlaceholder} />
        {trailing}
      </div>
    </div>
  );
}

export type LastDoc = { client_id: string; client_name: string; id: string; number: string; title: string | null; total: number; currency: string; issue_date: string };

/** "+" menu on the invoice list: new invoice / credit note / duplicate last invoice for a client. */
export function NewInvoiceMenu({ lastByClient }: { lastByClient: LastDoc[] }) {
  const [dup, setDup] = useState(false);
  return (
    <>
      <Menu
        label="New"
        trigger={
          <span>
            <IconButton label="New" className="lg:hidden"><Plus className="size-[22px]" strokeWidth={2.4} /></IconButton>
            <Button variant="filled" size="sm" icon={<Plus className="size-4" strokeWidth={2.6} />} className="hidden lg:inline-flex">New</Button>
          </span>
        }
        items={[
          { label: 'New invoice', href: '/invoices/new', icon: <FilePlus2 /> },
          { label: 'New estimate', href: '/invoices/new?kind=estimate', icon: <ClipboardList /> },
          { label: 'New credit note', href: '/invoices/new?kind=credit_note', icon: <ReceiptText /> },
          'separator',
          { label: 'Duplicate last invoice…', onSelect: () => setDup(true), icon: <Copy />, disabled: !lastByClient.length },
          { label: 'Recurring invoices', href: '/invoices/recurring', icon: <Repeat /> },
        ]}
      />
      <DuplicateSheet open={dup} onClose={() => setDup(false)} items={lastByClient} />
    </>
  );
}

function DuplicateSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: LastDoc[] }) {
  const [q, setQ] = useState('');
  const list = items.filter((i) => !q || i.client_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Duplicate last invoice" size="sm" fit>
      <p className="mb-3 px-1 text-footnote text-label-2">Starts a new draft with the same lines, dated today. Month names in the lines move to this month.</p>
      <label className="mb-3 flex h-9 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2">
        <Search className="size-4" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client" className="h-full flex-1 bg-transparent text-label outline-none" />
      </label>
      <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '58px' }}>
        {list.map((i) => (
          <Link key={i.client_id} href={`/invoices/new?from=${i.id}`} onClick={onClose} className={cn('row-press flex items-center gap-3 px-4 py-2.5 lg:px-3 lg:py-2')}>
            <ClientTile id={i.client_id} name={i.client_name} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{i.client_name}</span>
              <span className="block truncate text-footnote text-label-2">{i.number} · {i.title ?? 'Untitled'} · {shortDate(i.issue_date)}</span>
            </span>
            <span className="tabular text-subhead text-label-2">{money(i.total, i.currency)}</span>
          </Link>
        ))}
        {!list.length && <div className="px-4 py-6 text-center text-subhead text-label-2">No matching clients</div>}
      </div>
    </Sheet>
  );
}
