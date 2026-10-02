'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Row, Section } from '@/components/ui/group';
import { Badge, type Tone } from '@/components/ui/badge';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

export type DrillRow = { id: string; href?: string; title: string; subtitle?: string; amount?: number; detail?: string; badge?: { label: string; tone: Tone } };

/**
 * A trigger that opens a sheet listing the records behind a number, each
 * linking to its record. Rows are plain data so server pages can pass them.
 */
export function DrillSheet({ title, summary, rows, total, children, className, footer }: {
  title: string; summary?: string; rows: DrillRow[]; total?: number; children: ReactNode; className?: string; footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.title} ${r.subtitle ?? ''} ${r.detail ?? ''}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('w-full text-left', className)} disabled={!rows.length} aria-haspopup="dialog">
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} cancelLabel="Done" size="lg">
        <div className="pt-1">
          {summary && <p className="mb-3 px-1 text-subhead text-label-2">{summary}</p>}
          {rows.length > 8 && (
            <label className="mb-3 flex h-10 items-center gap-2 rounded-[10px] bg-fill px-3 lg:h-8">
              <Search className="size-4 text-label-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${rows.length} records`} className="min-w-0 flex-1 bg-transparent text-body outline-none lg:text-subhead" />
            </label>
          )}
          <Section footer={footer}>
            {shown.map((r) => (
              <Row
                key={r.id}
                href={r.href}
                title={<span className="flex items-center gap-2"><span className="truncate">{r.title}</span>{r.badge && <Badge tone={r.badge.tone}>{r.badge.label}</Badge>}</span>}
                subtitle={r.subtitle}
                value={r.amount !== undefined ? money(r.amount) : undefined}
                detail={r.detail}
              />
            ))}
            {!shown.length && <div className="px-4 py-6 text-center text-subhead text-label-2">Nothing matches.</div>}
            {total !== undefined && shown.length === rows.length && (
              <div className="flex min-h-[var(--row-h)] items-center px-4 font-semibold lg:px-3">
                <span className="flex-1">Total · {rows.length}</span>
                <span className="tabular">{money(total)}</span>
              </div>
            )}
          </Section>
        </div>
      </Sheet>
    </>
  );
}
