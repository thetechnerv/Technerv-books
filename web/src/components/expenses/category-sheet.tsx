'use client';
import { Check } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { CategoryTile } from './category-icon';

export type CategoryOption = { id: string; name: string; icon: string | null; deductible_pct: number; is_capital: boolean; cca_class: string | null };

/** Icon grid of expense categories, recently used first. */
export function CategorySheet({ open, onClose, categories, recent, value, onChange }: {
  open: boolean; onClose: () => void; categories: CategoryOption[]; recent: string[]; value: string | null; onChange: (id: string | null) => void;
}) {
  const recentCats = recent.map((id) => categories.find((c) => c.id === id)).filter(Boolean) as CategoryOption[];
  const pick = (id: string | null) => { onChange(id); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title="Category" size="md">
      {recentCats.length > 0 && (
        <>
          <h3 className="mb-2 mt-1 px-1 text-footnote font-medium uppercase tracking-[0.04em] text-label-2">Recent</h3>
          <Grid items={recentCats} value={value} onPick={pick} />
        </>
      )}
      <h3 className="mb-2 mt-5 px-1 text-footnote font-medium uppercase tracking-[0.04em] text-label-2">All categories</h3>
      <Grid items={categories} value={value} onPick={pick} />
      {value && (
        <button type="button" onClick={() => pick(null)} className="pressable mx-auto mt-5 block rounded-full px-4 py-2 text-subhead font-medium text-red">
          Clear category
        </button>
      )}
    </Sheet>
  );
}

function Grid({ items, value, onPick }: { items: CategoryOption[]; value: string | null; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className={cn('pressable relative flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[14px] bg-cell px-2 py-3 text-center shadow-card',
            value === c.id && 'shadow-[inset_0_0_0_2px_var(--accent)]')}
        >
          <CategoryTile icon={c.icon} size={36} />
          <span className="line-clamp-2 text-caption font-medium leading-tight">{c.name}</span>
          {c.deductible_pct < 100 && <span className="text-caption2 text-label-3">{c.deductible_pct}% deductible</span>}
          {c.is_capital && <span className="text-caption2 text-label-3">Capital · CCA {c.cca_class}</span>}
          {value === c.id && <Check className="absolute right-2 top-2 size-4 text-accent-text" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
