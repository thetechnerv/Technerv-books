import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Paperclip, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { money, num } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CategoryTile } from './category-icon';

export type ListExpense = {
  id: string; spent_on: string; vendor: string; description: string | null; category_name: string | null; category_icon: string | null;
  spent_by_name: string; spent_by_initials: string | null; spent_by_color: string | null; paid_from_name: string; paid_from_kind: string;
  paid_with_business_funds: boolean; nature: 'business' | 'personal' | 'mixed'; business_pct: number; currency: string; total: number;
  total_cad: number; deductible_cad: number; itc_cad: number; attachment_count: number; settled: boolean; is_capital: boolean | null;
};

export function paidWithLabel(e: Pick<ListExpense, 'paid_from_kind' | 'paid_from_name'>) {
  return e.paid_from_kind === 'personal' ? 'Personal money' : e.paid_from_name;
}

export function NatureBadge({ nature, pct }: { nature: string; pct: number }) {
  if (nature === 'personal') return <Badge tone="purple">Personal</Badge>;
  if (nature === 'mixed') return <Badge tone="blue">{Math.round(pct)}% biz</Badge>;
  return null;
}

export type MonthGroup = { key: string; label: string; total: number; items: ListExpense[] };

export function groupByMonth(items: ListExpense[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const e of items) {
    const key = e.spent_on.slice(0, 7);
    let g = map.get(key);
    if (!g) { g = { key, label: format(parseISO(key + '-01'), 'MMMM yyyy'), total: 0, items: [] }; map.set(key, g); }
    g.total += num(e.total_cad);
    g.items.push(e);
  }
  return [...map.values()];
}

function Amount({ e }: { e: ListExpense }) {
  return (
    <span className="flex shrink-0 flex-col items-end text-right">
      <span className={cn('tabular text-body font-medium', e.nature === 'personal' && 'text-label-2')}>{money(e.total_cad)}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        {e.currency !== 'CAD' && <span className="tabular text-footnote text-label-3">{money(e.total, e.currency)}</span>}
        {e.attachment_count > 0 && <Paperclip className="size-3.5 text-label-3" aria-label="Receipt attached" />}
        <NatureBadge nature={e.nature} pct={e.business_pct} />
      </span>
    </span>
  );
}

/** Phone list: inset-grouped rows per month. */
export function ExpenseRows({ groups }: { groups: MonthGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="mb-6">
          <div className="mb-1.5 flex items-end justify-between px-4">
            <h2 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2">{g.label}</h2>
            <span className="tabular text-footnote text-label-2">{money(g.total)}</span>
          </div>
          <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '58px' }}>
            {g.items.map((e) => (
              <Link key={e.id} href={`/expenses/${e.id}`} className="row-press flex min-h-[64px] items-center gap-3 px-4">
                <CategoryTile icon={e.category_icon} />
                <span className="min-w-0 flex-1 py-2.5">
                  <span className="block truncate text-body">{e.vendor}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1 text-subhead text-label-2">
                    <span className="truncate">{[e.description || e.category_name, paidWithLabel(e)].filter(Boolean).join(' · ')}</span>
                    <span aria-hidden>·</span>
                    <Avatar name={e.spent_by_name} color={e.spent_by_color} initials={e.spent_by_initials} size={16} />
                  </span>
                </span>
                <Amount e={e} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

type SortKey = 'date' | 'vendor' | 'amount';
function SortHead({ k, children, right, sort, hrefs }: { k?: SortKey; children: React.ReactNode; right?: boolean; sort: string; hrefs: Record<SortKey, string> }) {
  if (!k) return <span className={cn(right && 'text-right')}>{children}</span>;
  return (
    <Link href={hrefs[k]} scroll={false} replace className={cn('hover:text-label', right && 'text-right', sort === k && 'text-label')}>
      {children}{sort === k ? (k === 'vendor' ? ' ↑' : ' ↓') : ''}
    </Link>
  );
}

const COLS = 'grid grid-cols-[84px_minmax(0,1.7fr)_minmax(0,1.1fr)_36px_minmax(0,1fr)_84px_104px_76px_28px] items-center gap-3 px-3';

/** Desktop: dense, sortable table grouped by month. */
export function ExpenseTable({ groups, sortHrefs, sort }: { groups: MonthGroup[]; sortHrefs: Record<SortKey, string>; sort: string }) {
  return (
    <div className="overflow-clip rounded-group bg-cell shadow-card">
      <div className={cn(COLS, 'material-bar sticky top-[var(--sticky-top)] z-10 h-8 text-caption font-semibold uppercase tracking-[0.03em] text-label-2 hairline-b')}>
        <SortHead k="date" sort={sort} hrefs={sortHrefs}>Date</SortHead><SortHead k="vendor" sort={sort} hrefs={sortHrefs}>Vendor</SortHead><span>Category</span><span>Who</span><span>Paid with</span><span>Nature</span><SortHead k="amount" right sort={sort} hrefs={sortHrefs}>Total</SortHead><span className="text-right">ITC</span><span className="sr-only">Receipt</span>
      </div>
      {groups.map((g) => (
        <div key={g.key}>
          {groups.length > 1 && (
            <div className="flex h-8 items-center justify-between bg-inset px-3 text-caption font-semibold uppercase tracking-[0.03em] text-label-2 hairline-b">
              <span>{g.label}</span><span className="tabular">{money(g.total)}</span>
            </div>
          )}
          {g.items.map((e) => (
            <Link key={e.id} href={`/expenses/${e.id}`} className={cn(COLS, 'group h-10 text-subhead hairline-b hover:bg-fill-2')}>
              <span className="tabular text-label-2">{format(parseISO(e.spent_on), 'MMM d, yy')}</span>
              <span className="min-w-0 truncate"><span className="font-medium">{e.vendor}</span>{e.description && <span className="text-label-2"> · {e.description}</span>}</span>
              <span className="flex min-w-0 items-center gap-2 text-label-2"><CategoryTile icon={e.category_icon} size={20} /><span className="truncate">{e.category_name ?? '—'}</span></span>
              <Avatar name={e.spent_by_name} color={e.spent_by_color} initials={e.spent_by_initials} size={22} />
              <span className="truncate text-label-2">{paidWithLabel(e)}</span>
              <span><NatureBadge nature={e.nature} pct={e.business_pct} />{e.nature === 'business' && <span className="text-label-3">Business</span>}</span>
              <span className="text-right">
                <span className="tabular block font-medium">{money(e.total_cad)}</span>
                {e.currency !== 'CAD' && <span className="tabular block text-caption text-label-3">{money(e.total, e.currency)}</span>}
              </span>
              <span className="tabular text-right text-label-2">{num(e.itc_cad) ? money(e.itc_cad) : '—'}</span>
              <span className="flex justify-end">
                {e.attachment_count > 0 ? <Paperclip className="size-3.5 text-label-3" aria-label="Receipt attached" /> : <ChevronRight className="size-3.5 text-label-4 opacity-0 group-hover:opacity-100" />}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
