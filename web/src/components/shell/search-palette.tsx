'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, X, Loader2, Clock, CornerDownLeft, Users, FileText, Receipt, HandCoins, FolderLock, UserPlus, Download, Lock, SunMoon,
  Building2, Palette, Calculator, Landmark, Shapes, Package, Car, Scale, HardDrive, History, UserRound, type LucideIcon,
} from 'lucide-react';
import { QUICK_ADD } from './app-shell';
import { ALL_NAV } from './nav';
import { StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { useDebounced, useIsDesktop } from '@/lib/hooks';
import type { SearchGroup, SearchItem } from '@/app/api/search/route';

/* ───────────────────────── Entry points ───────────────────────── */

export function openSearch() {
  window.dispatchEvent(new CustomEvent('open-search'));
}

/** Drop-in button that opens the ⌘K palette. Use `compact` for an icon-only nav-bar button. */
export function SearchButton({ className, label = 'Search', compact }: { className?: string; label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <button type="button" onClick={openSearch} aria-label={label} title={`${label} (⌘K)`} className={cn('pressable inline-flex size-9 items-center justify-center rounded-full text-accent-text hover:bg-fill-2 lg:size-8', className)}>
        <Search className="size-5 lg:size-[18px]" strokeWidth={2.2} />
      </button>
    );
  }
  return (
    <button type="button" onClick={openSearch} className={cn('pressable flex h-9 w-full items-center gap-2 rounded-[10px] bg-fill px-3 text-left text-body text-label-3 lg:h-8 lg:text-subhead', className)}>
      <Search className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <kbd className="hidden font-sans text-footnote lg:inline">⌘K</kbd>
    </button>
  );
}

/* ───────────────────────── Static entries ───────────────────────── */

type Entry = {
  key: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: LucideIcon;
  color?: string;
  keywords?: string;
  external?: boolean;
  item?: SearchItem;
  group: string;
};

const ACTION_LABELS: Record<string, { title: string; keywords: string }> = {
  '/expenses/new': { title: 'Add expense', keywords: 'new expense spend purchase bill' },
  '/expenses/new?scan=1': { title: 'Snap a receipt', keywords: 'scan photo camera receipt' },
  '/invoices/new': { title: 'New invoice', keywords: 'create bill client invoice' },
  '/invoices/new?kind=estimate': { title: 'New estimate', keywords: 'quote proposal estimate' },
  '/payments?new=1': { title: 'Record payment', keywords: 'payment received deposit paid' },
  '/mileage?new=1': { title: 'Log a trip', keywords: 'mileage drive km kilometres car' },
  '/banking/import': { title: 'Import statement', keywords: 'csv bank card upload statement' },
  '/balances?new=1': { title: 'Record owner transfer', keywords: 'reimburse repay dividend contribution owner' },
};

const ACTIONS: Entry[] = [
  ...QUICK_ADD.map((q) => ({
    key: `a:${q.href}`, group: 'Actions', href: q.href, icon: q.icon, color: q.color,
    title: ACTION_LABELS[q.href]?.title ?? q.label, keywords: ACTION_LABELS[q.href]?.keywords,
  })),
  { key: 'a:client', group: 'Actions', href: '/clients/new', icon: UserPlus, color: '#0680A2', title: 'New client', keywords: 'add customer client' },
  { key: 'a:close', group: 'Actions', href: '/settings/tax', icon: Lock, color: '#E0352B', title: 'Close the books', keywords: 'lock year end fiscal' },
  { key: 'a:export', group: 'Actions', href: '/api/settings/export', icon: Download, color: '#6B7B80', title: 'Export everything', keywords: 'csv zip backup download accountant', external: true },
  { key: 'a:theme', group: 'Actions', href: '/settings/appearance', icon: SunMoon, color: '#3B4B4E', title: 'Change appearance', keywords: 'dark light mode theme' },
];

const SETTINGS_PAGES: Omit<Entry, 'key' | 'group'>[] = [
  { href: '/settings/company', title: 'Company settings', icon: Building2, color: '#0680A2', keywords: 'business number gst address legal name timezone' },
  { href: '/settings/branding', title: 'Branding & invoices', icon: Palette, color: '#D9467A', keywords: 'logo theme accent numbering prefix payment instructions bank' },
  { href: '/settings/tax', title: 'Tax settings', icon: Calculator, color: '#E0352B', keywords: 'gst hst rates filing fiscal year end quick method' },
  { href: '/settings/members', title: 'Members', icon: Users, color: '#05A38C', keywords: 'owners people sign in ownership' },
  { href: '/settings/accounts', title: 'Money accounts', icon: Landmark, color: '#0478A0', keywords: 'bank card personal accounts' },
  { href: '/settings/categories', title: 'Categories', icon: Shapes, color: '#E8833A', keywords: 'gifi expense income cca' },
  { href: '/settings/products', title: 'Products & services', icon: Package, color: '#7C4DDB', keywords: 'items catalogue price' },
  { href: '/settings/mileage', title: 'Mileage rates', icon: Car, color: '#5E7CE2', keywords: 'cra km allowance' },
  { href: '/settings/owners', title: 'Owners & loans', icon: Scale, color: '#03BB90', keywords: 'shareholder loan alert' },
  { href: '/settings/appearance', title: 'Appearance', icon: SunMoon, color: '#3B4B4E', keywords: 'dark light theme' },
  { href: '/settings/data', title: 'Data & storage', icon: HardDrive, color: '#6B7B80', keywords: 'export storage files' },
  { href: '/settings/activity', title: 'Activity history', icon: History, color: '#E5A00D', keywords: 'log audit changes' },
  { href: '/settings/account', title: 'Account', icon: UserRound, color: '#6B7B80', keywords: 'sign out profile' },
];

const PAGES: Entry[] = [
  ...ALL_NAV.map((n) => ({ key: `p:${n.href}`, group: 'Pages', href: n.href, icon: n.icon, color: n.color, title: n.label })),
  ...SETTINGS_PAGES.map((p) => ({ ...p, key: `p:${p.href}`, group: 'Pages', subtitle: 'Settings' })),
];

const GROUP_ICON: Record<string, LucideIcon> = { clients: Users, invoices: FileText, expenses: Receipt, payments: HandCoins, documents: FolderLock };
const GROUP_COLOR: Record<string, string> = { clients: '#0680A2', invoices: '#05A38C', expenses: '#E8833A', payments: '#03BB90', documents: '#5B6B70' };

function matches(e: Entry, words: string[]) {
  const hay = `${e.title} ${e.subtitle ?? ''} ${e.keywords ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ───────────────────────── Recent searches ───────────────────────── */

const RECENT_KEY = 'tn-recent-searches';
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').filter((x: unknown) => typeof x === 'string').slice(0, 6); } catch { return []; }
}
function saveRecent(q: string, list: string[]) {
  const next = [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  return next;
}

/* ───────────────────────── Palette ───────────────────────── */

const noopSubscribe = () => () => {};

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !open) {
        const t = e.target as HTMLElement;
        if (!t.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); setOpen(true); }
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-search', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-search', onOpen); };
  }, [open]);

  // Close when navigation happens (e.g. via browser back).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) { setLastPath(pathname); if (open) setOpen(false); }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{open && <Panel onClose={() => setOpen(false)} />}</AnimatePresence>,
    document.body,
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const desktop = useIsDesktop();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [remote, setRemote] = useState<{ q: string; groups: SearchGroup[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 160);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => { document.body.style.overflow = prev; clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (debounced.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => setLoading(true), 0);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { q: debounced, groups: [] }))
      .then((d: { q: string; groups: SearchGroup[] }) => { setRemote({ q: debounced, groups: d.groups ?? [] }); setLoading(false); })
      .catch((e: Error) => { if (e.name !== 'AbortError') setLoading(false); });
    return () => { clearTimeout(t); ctl.abort(); };
  }, [debounced]);

  const wordsKey = q.trim().toLowerCase().replace(/\s+/g, ' ');
  const words = useMemo(() => wordsKey.split(' ').filter(Boolean), [wordsKey]);
  const showRemote = remote && debounced.length >= 2 && remote.q === debounced;

  const sections = useMemo(() => {
    const out: { label: string; entries: Entry[] }[] = [];
    if (!words.length) {
      if (recent.length) out.push({ label: 'Recent searches', entries: recent.map((r) => ({ key: `r:${r}`, group: 'Recent', title: r, href: '', icon: Clock })) });
      out.push({ label: 'Actions', entries: ACTIONS.slice(0, 6) });
      out.push({ label: 'Jump to', entries: PAGES.filter((p) => ['/invoices', '/expenses', '/banking/review', '/tax', '/reports', '/settings'].includes(p.href)) });
      return out;
    }
    const pages = PAGES.filter((p) => matches(p, words)).slice(0, 5);
    const actions = ACTIONS.filter((a) => matches(a, words)).slice(0, 4);
    if (actions.length) out.push({ label: 'Actions', entries: actions });
    if (pages.length) out.push({ label: 'Pages', entries: pages });
    if (showRemote) {
      for (const g of remote!.groups) {
        out.push({
          label: g.label,
          entries: g.items.map((it) => ({ key: `${g.key}:${it.id}`, group: g.key, title: it.title, subtitle: it.subtitle, href: it.href, icon: GROUP_ICON[g.key], color: GROUP_COLOR[g.key], item: it })),
        });
      }
    }
    return out;
  }, [words, recent, showRemote, remote]);

  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = useCallback((e: Entry) => {
    if (e.group === 'Recent') { setQ(e.title); setActive(0); input.current?.focus(); return; }
    if (q.trim().length >= 2) setRecent((r) => saveRecent(q.trim(), r));
    onClose();
    if (e.external) window.location.href = e.href;
    else router.push(e.href);
  }, [q, onClose, router]);

  function onKeyDown(ev: React.KeyboardEvent) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => (flat.length ? (Math.min(a, flat.length - 1) + 1) % flat.length : 0)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => (flat.length ? (Math.min(a, flat.length - 1) - 1 + flat.length) % flat.length : 0)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const e = flat[activeIndex]; if (e) choose(e); }
    else if (ev.key === 'Escape') { ev.preventDefault(); if (q) setQ(''); else onClose(); }
  }

  const busy = loading || (debounced !== q.trim() && q.trim().length >= 2);
  const noResults = words.length > 0 && !busy && showRemote && flat.length === 0;
  const tooShort = words.length > 0 && q.trim().length < 2 && flat.length === 0;

  const field = (
    <div className={cn('flex items-center gap-2.5', desktop ? 'h-14 px-4 hairline-b' : 'h-10 flex-1 rounded-[10px] bg-fill px-2.5')}>
      {busy ? <Loader2 className="size-[18px] shrink-0 animate-spin text-label-3" /> : <Search className={cn('shrink-0 text-label-3', desktop ? 'size-5' : 'size-[18px]')} />}
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        placeholder="Search clients, invoices, expenses…"
        aria-label="Search"
        role="combobox"
        aria-expanded
        aria-controls="search-results"
        aria-activedescendant={flat[activeIndex] ? `search-opt-${activeIndex}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        type="search"
        className={cn('min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden', desktop ? 'text-title3 font-normal' : 'text-body')}
      />
      {q && (
        <button type="button" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-label-3 text-bg">
          <X className="size-3" strokeWidth={3} />
        </button>
      )}
      {desktop && <kbd className="shrink-0 rounded-[5px] bg-fill px-1.5 py-0.5 font-sans text-caption font-medium text-label-2">esc</kbd>}
    </div>
  );

  let index = -1;
  const results = (
    <div ref={list} id="search-results" role="listbox" aria-label="Search results" className={cn('overflow-y-auto overscroll-contain', desktop ? 'max-h-[min(60vh,520px)] p-2' : 'min-h-0 flex-1 px-4 pb-[calc(var(--safe-bottom)+24px)] pt-2')}>
      {sections.map((s) => (
        <div key={s.label} className={desktop ? 'mb-1.5' : 'mb-5'} role="group" aria-label={s.label}>
          <div className={cn('flex items-center justify-between font-medium uppercase tracking-[0.04em] text-label-2', desktop ? 'px-2.5 pb-1 pt-1.5 text-caption' : 'mb-1.5 px-4 text-footnote')}>
            <span>{s.label}</span>
            {s.label === 'Recent searches' && (
              <button type="button" className="normal-case tracking-normal text-accent-text" onClick={() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch {} }}>Clear</button>
            )}
          </div>
          <div className={desktop ? '' : 'group-rows overflow-hidden rounded-group bg-cell shadow-card'} style={desktop ? undefined : { ['--row-inset' as string]: '58px' }}>
            {s.entries.map((e) => {
              index++;
              const i = index;
              return (
                <ResultRow
                  key={e.key}
                  id={`search-opt-${i}`}
                  index={i}
                  entry={e}
                  words={words}
                  active={desktop && i === activeIndex}
                  desktop={desktop}
                  onHover={() => setActive(i)}
                  onChoose={() => choose(e)}
                />
              );
            })}
          </div>
        </div>
      ))}
      {noResults && (
        <div className="px-6 py-10 text-center">
          <p className="text-headline font-semibold">No results for “{q.trim()}”</p>
          <p className="mt-1 text-subhead text-label-2">Try a client name, an invoice number like TN-1088, a vendor, or an amount.</p>
        </div>
      )}
      {tooShort && <p className="px-6 py-8 text-center text-subhead text-label-2">Keep typing…</p>}
    </div>
  );

  if (desktop) {
    return (
      <div className="fixed inset-0 z-[85] flex justify-center px-6 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
        <motion.div className="absolute inset-0 bg-[var(--scrim)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', bounce: 0.12, duration: 0.32 }}
          className="material-thick relative flex h-fit w-full max-w-[640px] flex-col overflow-hidden rounded-[16px] shadow-pop"
        >
          {field}
          {results}
          <div className="flex items-center gap-4 px-4 py-2 text-caption text-label-3 hairline-t">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
            <span className="flex items-center gap-1"><Kbd><CornerDownLeft className="size-3" /></Kbd> to open</span>
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> to close</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[85] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
        {field}
        <button type="button" onClick={onClose} className="pressable shrink-0 px-1 text-body text-accent-text">Cancel</button>
      </div>
      {results}
    </motion.div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-fill px-1 font-sans text-caption2 font-medium text-label-2">{children}</kbd>;
}

function ResultRow({ id, index, entry: e, words, active, desktop, onHover, onChoose }: {
  id: string; index: number; entry: Entry; words: string[]; active: boolean; desktop: boolean; onHover: () => void; onChoose: () => void;
}) {
  const Icon = e.icon;
  const it = e.item;
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      data-index={index}
      onMouseMove={desktop ? onHover : undefined}
      onClick={onChoose}
      className={cn(
        'flex w-full items-center gap-3 text-left',
        desktop ? 'min-h-11 rounded-[9px] px-2.5 py-1.5' : 'row-press min-h-[var(--row-h)] px-4 py-2',
        active && 'bg-accent-soft',
      )}
    >
      {Icon && (
        e.group === 'Recent'
          ? <span className="flex size-[30px] shrink-0 items-center justify-center text-label-3 lg:size-7"><Icon className="size-[18px]" /></span>
          : <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] text-white lg:size-7 lg:rounded-[7px]" style={{ background: e.color ?? 'var(--fill-3)' }}><Icon className="size-[17px] lg:size-4" strokeWidth={2.2} /></span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body lg:text-subhead"><Highlight text={e.title} words={words} /></span>
        {e.subtitle && <span className="block truncate text-footnote text-label-2"><Highlight text={e.subtitle} words={words} /></span>}
      </span>
      {it && (it.amount !== undefined || it.status) && (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {it.amount !== undefined && <span className="tabular text-subhead font-medium">{money(it.amount, it.currency ?? 'CAD')}</span>}
          {it.status && <StatusBadge status={it.status} overdue={it.overdue} />}
        </span>
      )}
      {desktop && active && !it && <CornerDownLeft className="size-4 shrink-0 text-label-3" />}
    </button>
  );
}

/** Wraps each query word found in `text` in a highlight. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${esc.join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <mark key={i} className="rounded-[3px] bg-accent-soft font-semibold text-label">{p}</mark>
        : <span key={i}>{p}</span>))}
    </>
  );
}
