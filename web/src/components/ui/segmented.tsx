'use client';
import Link from 'next/link';
import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

type Opt<T extends string> = { value: T; label: React.ReactNode; count?: number };

const THUMB = { type: 'spring' as const, bounce: 0.15, duration: 0.35 };

function Track({ children, className, full }: { children: React.ReactNode; className?: string; full?: boolean }) {
  return (
    <div className={cn('no-scrollbar flex overflow-x-auto rounded-[9px] bg-fill p-[2px] lg:rounded-[7px]', full ? 'w-full' : 'inline-flex max-w-full', className)} role="tablist">
      {children}
    </div>
  );
}

function Segment({ active, layoutId, children }: { active: boolean; layoutId: string; children: React.ReactNode }) {
  return (
    <>
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={THUMB}
          className="absolute inset-0 rounded-[7px] bg-[var(--bg-cell)] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] lg:rounded-[5px]"
          style={{ background: 'var(--segment-thumb, var(--bg-cell))' }}
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </>
  );
}

const segCls = (active: boolean) =>
  cn('pressable relative flex h-[30px] flex-1 shrink-0 items-center justify-center whitespace-nowrap px-3 text-subhead lg:h-6 lg:text-footnote',
    active ? 'font-semibold text-label' : 'font-medium text-label-2');

function Count({ n }: { n?: number }) {
  if (n === undefined) return null;
  return <span className="tabular text-caption font-medium text-label-3">{n}</span>;
}

/** Controlled segmented control. */
export function Segmented<T extends string>({ options, value, onChange, full, className }: { options: Opt<T>[]; value: T; onChange: (v: T) => void; full?: boolean; className?: string }) {
  const id = useId();
  return (
    <Track full={full} className={className}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={segCls(o.value === value)} onClick={() => onChange(o.value)}>
          <Segment active={o.value === value} layoutId={id}>{o.label}<Count n={o.count} /></Segment>
        </button>
      ))}
    </Track>
  );
}

/** URL-driven segmented control for server-rendered filters. */
export function LinkSegmented({ options, value, full, className, id = 'seg' }: { options: (Opt<string> & { href: string })[]; value: string; full?: boolean; className?: string; id?: string }) {
  return (
    <Track full={full} className={className}>
      {options.map((o) => (
        <Link key={o.value} href={o.href} scroll={false} replace role="tab" aria-selected={o.value === value} className={segCls(o.value === value)}>
          <Segment active={o.value === value} layoutId={`link-seg-${id}`}>{o.label}<Count n={o.count} /></Segment>
        </Link>
      ))}
    </Track>
  );
}
