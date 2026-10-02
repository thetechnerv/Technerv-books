'use client';
import { useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Badge, type Tone } from '@/components/ui/badge';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ProjectSheet } from './project-sheet';

export type ProjectRow = { id: string; name: string; status: string; budget: number | null; billed: number; started_on: string | null };

export const PROJECT_TONE: Record<string, Tone> = { lead: 'purple', active: 'accent', paused: 'orange', done: 'gray' };
export const PROJECT_LABEL: Record<string, string> = { lead: 'Lead', active: 'Active', paused: 'Paused', done: 'Done' };

export function ProjectsSection({ clientId, currency, projects }: { clientId: string; currency: string; projects: ProjectRow[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Section
        title="Projects"
        action={<button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-footnote font-medium text-accent-text"><Plus className="size-3.5" strokeWidth={2.6} />Project</button>}
      >
        {projects.length === 0 ? (
          <button type="button" onClick={() => setAdding(true)} className="row-press flex w-full flex-col items-center px-6 py-7 text-center">
            <FolderKanban className="mb-2 size-8 text-label-3" strokeWidth={1.4} />
            <span className="text-subhead text-label-2">Group invoices and expenses by project to see budget and profit.</span>
            <span className="mt-2 text-subhead font-semibold text-accent-text">Add a project</span>
          </button>
        ) : projects.map((p) => (
          <Row key={p.id} href={`/clients/${clientId}/projects/${p.id}`} title={<span className="font-medium">{p.name}</span>}
            subtitle={<BudgetLine billed={p.billed} budget={p.budget} currency={currency} />}>
            <Badge tone={PROJECT_TONE[p.status]}>{PROJECT_LABEL[p.status] ?? p.status}</Badge>
          </Row>
        ))}
      </Section>
      <ProjectSheet open={adding} onClose={() => setAdding(false)} clientId={clientId} currency={currency} />
    </>
  );
}

function BudgetLine({ billed, budget, currency }: { billed: number; budget: number | null; currency: string }) {
  if (!budget) return <span>{billed ? `${money(billed, currency, { cents: false })} billed · no budget` : 'No budget set'}</span>;
  return (
    <span className="block">
      <span className="tabular">{money(billed, currency, { cents: false })} of {money(budget, currency, { cents: false })}</span>
      <BudgetBar billed={billed} budget={budget} className="mt-1.5 max-w-[260px]" />
    </span>
  );
}

/** Thin capsule progress bar: accent until budget, red beyond. */
export function BudgetBar({ billed, budget, className, thick }: { billed: number; budget: number; className?: string; thick?: boolean }) {
  const pct = budget > 0 ? billed / budget : 0;
  const over = pct > 1.0001;
  return (
    <span
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${Math.round(pct * 100)}% of budget billed`}
      className={cn('relative block overflow-hidden rounded-full bg-fill', thick ? 'h-2' : 'h-[5px]', className)}
    >
      <span className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', over ? 'bg-red' : 'bg-accent')} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      {over && <span className="absolute inset-y-0 rounded-full bg-cell" style={{ left: `${100 / pct}%`, width: 1.5 }} />}
    </span>
  );
}
