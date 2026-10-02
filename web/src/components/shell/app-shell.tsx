'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Plus, House, FileText, Receipt, LayoutGrid, Camera, ClipboardList, HandCoins, Car, Upload, ArrowLeftRight, Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { NAV, activeHref } from './nav';
import { LogoMark } from './logo';
import { Avatar } from '@/components/ui/avatar';
import { Sheet } from '@/components/ui/sheet';
import { Menu } from '@/components/ui/menu';

export type ShellProps = {
  member: { full_name: string; color: string | null; initials: string | null; email: string };
  company: string;
  counts: { review: number; overdue: number };
  devSession: boolean;
  children: ReactNode;
};

export const QUICK_ADD = [
  { href: '/expenses/new', label: 'Expense', icon: Receipt, color: '#E8833A' },
  { href: '/expenses/new?scan=1', label: 'Snap receipt', icon: Camera, color: '#D9467A' },
  { href: '/invoices/new', label: 'Invoice', icon: FileText, color: '#05A38C' },
  { href: '/invoices/new?kind=estimate', label: 'Estimate', icon: ClipboardList, color: '#7C4DDB' },
  { href: '/payments?new=1', label: 'Payment received', icon: HandCoins, color: '#03BB90' },
  { href: '/mileage?new=1', label: 'Trip', icon: Car, color: '#5E7CE2' },
  { href: '/banking/import', label: 'Import statement', icon: Upload, color: '#0680A2' },
  { href: '/balances?new=1', label: 'Owner transfer', icon: ArrowLeftRight, color: '#5B6B70' },
];

export function AppShell({ member, company, counts, devSession, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const active = activeHref(pathname);
  const [quickAdd, setQuickAdd] = useState(false);
  // Full-screen editors hide the tab bar, as iOS does for pushed task screens.
  const editing = /\/(new|edit)$/.test(pathname) || pathname.startsWith('/banking/import') || params.get('edit') === '1';

  // Keyboard: N = new, ⌘K = search (search palette listens for this too)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setQuickAdd(true); }
      if (e.key === 'e' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); router.push('/expenses/new'); }
      if (e.key === 'i' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); router.push('/invoices/new'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="lg:flex" data-tabbar={editing ? 'hidden' : undefined}>
      {/* ───────── Desktop sidebar ───────── */}
      <aside className="material-sidebar sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col shadow-[inset_-0.5px_0_0_var(--separator)] lg:flex">
        <div className="flex h-[52px] items-center gap-2.5 px-4">
          <LogoMark size={26} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-subhead font-semibold">{company}</div>
            <div className="text-caption text-label-2">Accounts</div>
          </div>
        </div>
        <div className="flex gap-2 px-3 pb-2">
          <Menu
            align="start"
            label="New"
            trigger={
              <button className="pressable flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-subhead font-semibold text-on-accent">
                <Plus className="size-4" strokeWidth={2.6} /> New
              </button>
            }
            items={QUICK_ADD.map((q) => ({ label: q.label, href: q.href, icon: <q.icon /> }))}
          />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
            className="pressable flex h-8 items-center gap-1.5 rounded-md bg-fill px-2.5 text-footnote text-label-2"
            title="Search (⌘K)"
          >
            <Search className="size-4" /> <kbd className="font-sans">⌘K</kbd>
          </button>
        </div>
        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((g, gi) => (
            <div key={gi} className="mt-3 first:mt-1">
              {g.label && <div className="px-2 pb-1 text-caption font-semibold text-label-3">{g.label}</div>}
              {g.items.map((it) => {
                const on = active === it.href;
                const badge = it.badge ? counts[it.badge] : 0;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn('flex h-[30px] items-center gap-2.5 rounded-[7px] px-2 text-subhead transition-colors',
                      on ? 'bg-fill-3 font-semibold text-label' : 'text-label hover:bg-fill-2')}
                  >
                    <it.icon className="size-[17px]" style={{ color: on ? it.color : undefined }} strokeWidth={on ? 2.2 : 1.8} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {badge > 0 && (
                      <span className={cn('tabular rounded-full px-1.5 text-caption font-semibold', it.badge === 'overdue' ? 'text-red' : 'text-label-2')}>{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <Link href="/settings/members" className="m-3 mt-0 flex items-center gap-2.5 rounded-lg p-2 hover:bg-fill-2">
          <Avatar name={member.full_name} color={member.color} initials={member.initials} size={28} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-subhead font-medium">{member.full_name}</div>
            <div className="truncate text-caption text-label-2">{devSession ? 'Dev session (no sign-in)' : member.email}</div>
          </div>
        </Link>
      </aside>

      {/* ───────── Content ───────── */}
      <div className="min-w-0 flex-1">{children}</div>

      {/* ───────── Phone tab bar ───────── */}
      {!editing && <TabBar active={active} pathname={pathname} counts={counts} onAdd={() => setQuickAdd(true)} />}
      <QuickAddSheet open={quickAdd} onClose={() => setQuickAdd(false)} />
    </div>
  );
}

function TabBar({ active, pathname, counts, onAdd }: { active: string; pathname: string; counts: ShellProps['counts']; onAdd: () => void }) {
  const tabs = [
    { href: '/', label: 'Home', icon: House },
    { href: '/invoices', label: 'Invoices', icon: FileText, badge: counts.overdue },
    null,
    { href: '/expenses', label: 'Expenses', icon: Receipt },
    { href: '/more', label: 'More', icon: LayoutGrid, badge: counts.review },
  ];
  const primary = ['/', '/invoices', '/expenses'];
  const current = primary.includes(active) ? active : pathname.startsWith('/invoices') ? '/invoices' : pathname.startsWith('/expenses') ? '/expenses' : '/more';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 lg:hidden"
      style={{ paddingBottom: 'max(var(--safe-bottom), 10px)' }}
    >
      <div className="material-glass flex h-[var(--tabbar-h)] w-full max-w-[440px] items-center rounded-full px-1.5">
        {tabs.map((t) =>
          t === null ? (
            <button
              key="add"
              onClick={onAdd}
              aria-label="Add"
              className="pressable mx-1 flex size-[50px] shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-4px_rgba(3,221,170,0.6)]"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </button>
          ) : (
            <Link key={t.href} href={t.href} className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5" aria-current={current === t.href ? 'page' : undefined}>
              {current === t.href && (
                <motion.span layoutId="tab-pill" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} className="absolute inset-x-0.5 inset-y-1.5 rounded-full bg-fill" />
              )}
              <span className="relative">
                <t.icon className={cn('size-[23px] transition-colors', current === t.href ? 'text-accent-text' : 'text-label')} strokeWidth={current === t.href ? 2.3 : 1.8} />
                {!!t.badge && <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">{t.badge}</span>}
              </span>
              <span className={cn('relative text-[10px] font-semibold tracking-[0.01em]', current === t.href ? 'text-accent-text' : 'text-label')}>{t.label}</span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add" cancelLabel={null} fit size="sm" action={<button onClick={onClose} className="text-body font-semibold text-accent-text">Done</button>}>
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        {QUICK_ADD.map((q, i) => (
          <motion.div key={q.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, type: 'spring', bounce: 0, duration: 0.35 }}>
            <Link href={q.href} onClick={onClose} className="pressable flex h-[92px] flex-col justify-between rounded-[18px] bg-cell p-3.5 shadow-card">
              <span className="flex size-9 items-center justify-center rounded-full" style={{ background: q.color + '1f', color: q.color }}>
                <q.icon className="size-5" strokeWidth={2} />
              </span>
              <span className="text-subhead font-semibold">{q.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </Sheet>
  );
}
