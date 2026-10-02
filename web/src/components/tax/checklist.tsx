'use client';
import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { setReview } from '@/app/(app)/tax/actions';
import { cn } from '@/lib/cn';

export type ChecklistItem = {
  key: string; title: string; detail: string; state: 'done' | 'todo' | 'warn' | 'info'; href: string; action?: string;
  manual?: 'owner_balances' | 'capital_assets'; reviewed?: boolean;
};

/** Year-end readiness checklist rows (render inside a <Section inset={52}>). Rows deep-link to where the work happens; two items are ticked by hand. */
export function Checklist({ items, period }: { items: ChecklistItem[]; period: { start: string; end: string; due: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function toggle(it: ChecklistItem) {
    if (!it.manual) return;
    start(async () => {
      const r = await setReview({ period_start: period.start, period_end: period.end, due_on: period.due, key: it.manual!, reviewed: !it.reviewed });
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({
        title: it.reviewed ? 'Review cleared' : `${it.title.replace(' reviewed', '')} marked reviewed`,
        action: { label: 'Undo', onClick: () => start(async () => { await setReview({ period_start: period.start, period_end: period.end, due_on: period.due, key: it.manual!, reviewed: !!it.reviewed }); router.refresh(); }) },
      });
      router.refresh();
    });
  }

  return (
    <>
      {items.map((it) => (
        <div key={it.key} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
          <StateIcon state={it.state} />
          <Link href={it.href} className="row-press -my-px min-w-0 flex-1 py-[11px] lg:py-2">
            <span className={cn('block', it.state === 'done' ? 'text-label-2' : 'text-label')}>{it.title}</span>
            <span className="mt-0.5 block text-subhead text-label-2 lg:text-footnote">{it.detail}</span>
          </Link>
          {it.manual ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(it)}
              className={cn('pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-footnote font-semibold lg:h-7',
                it.reviewed ? 'bg-fill text-label-2' : 'bg-accent-soft text-accent-text')}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {it.reviewed ? 'Undo' : 'Mark reviewed'}
            </button>
          ) : it.action ? (
            <Link href={it.href} className="pressable inline-flex h-8 shrink-0 items-center rounded-full bg-accent-soft px-3 text-footnote font-semibold text-accent-text lg:h-7">{it.action}</Link>
          ) : (
            <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
          )}
        </div>
      ))}
    </>
  );
}

function StateIcon({ state }: { state: ChecklistItem['state'] }) {
  if (state === 'done') return <CheckCircle2 className="size-[22px] shrink-0 text-accent-text" strokeWidth={2} aria-label="Done" />;
  if (state === 'warn') return <AlertTriangle className="size-[22px] shrink-0 text-orange" strokeWidth={2} aria-label="Needs attention" />;
  return <Circle className="size-[22px] shrink-0 text-label-4" strokeWidth={2} aria-label="To do" />;
}
