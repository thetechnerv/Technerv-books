'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Segmented } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { date, money, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export type DocRow = {
  id: string; kind: 'invoice' | 'estimate' | 'credit_note'; number: string; title: string | null; status: string;
  issue_date: string; due_date: string | null; total: number; balance: number; currency: string; is_overdue: boolean; days_overdue: number;
  project_name: string | null;
};

type Tab = 'invoice' | 'estimate' | 'credit_note';
const LIMIT = 8;

/** Invoices / estimates / credit notes for one client or project, in segmented tabs. */
export function DocumentsSection({ docs, newHref, title = 'Invoices & estimates', showProject = true }: { docs: DocRow[]; newHref?: { invoice: string; estimate: string }; title?: string; showProject?: boolean }) {
  const counts = { invoice: 0, estimate: 0, credit_note: 0 };
  for (const d of docs) counts[d.kind]++;
  const [tab, setTab] = useState<Tab>(counts.invoice || !counts.estimate ? 'invoice' : 'estimate');
  const [all, setAll] = useState(false);
  const list = docs.filter((d) => d.kind === tab);
  const shown = all ? list : list.slice(0, LIMIT);
  const tabs = ([
    { value: 'invoice', label: 'Invoices', count: counts.invoice },
    { value: 'estimate', label: 'Estimates', count: counts.estimate },
    { value: 'credit_note', label: 'Credits', count: counts.credit_note },
  ] as const).filter((t) => t.value !== 'credit_note' || t.count > 0);

  const add = newHref && (tab === 'estimate' ? newHref.estimate : newHref.invoice);

  return (
    <Section
      title={title}
      inset={16}
      action={add && (
        <Link href={add} className="flex items-center gap-1 text-footnote font-medium text-accent-text">
          <Plus className="size-3.5" strokeWidth={2.6} />{tab === 'estimate' ? 'Estimate' : 'Invoice'}
        </Link>
      )}
    >
      <div className="p-2 pb-1.5">
        <Segmented full options={tabs.map((t) => ({ ...t }))} value={tab} onChange={(t) => { setTab(t); setAll(false); }} />
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <FileText className="mb-2 size-8 text-label-3" strokeWidth={1.4} />
          <p className="text-subhead text-label-2">{tab === 'estimate' ? 'No estimates yet.' : tab === 'credit_note' ? 'No credit notes.' : 'No invoices yet.'}</p>
          {add && <Link href={add} className="mt-2 text-subhead font-semibold text-accent-text">{tab === 'estimate' ? 'Create an estimate' : 'Create the first invoice'}</Link>}
        </div>
      ) : (
        <>
          {shown.map((d) => <DocRowView key={d.id} d={d} showProject={showProject} />)}
          {list.length > LIMIT && (
            <button type="button" onClick={() => setAll((a) => !a)} className="row-press flex h-[var(--row-h)] w-full items-center justify-center text-subhead font-medium text-accent-text">
              {all ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function DocRowView({ d, showProject }: { d: DocRow; showProject: boolean }) {
  const open = d.kind === 'invoice' && (d.status === 'sent' || d.status === 'partial');
  const sub = [
    d.number,
    `Issued ${shortDateSmart(d.issue_date)}`,
    open && d.due_date ? (d.is_overdue ? `${d.days_overdue} ${d.days_overdue === 1 ? 'day' : 'days'} overdue` : `Due ${shortDateSmart(d.due_date)}`) : null,
    showProject ? d.project_name : null,
  ].filter(Boolean).join(' · ');
  return (
    <Row href={`/invoices/${d.id}`} title={<span className="font-medium">{d.title ?? d.number}</span>} subtitle={<span className={cn(d.is_overdue && 'text-red')}>{sub}</span>}>
      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <Money value={d.kind === 'credit_note' ? -d.total : d.total} currency={d.currency} className={cn('text-subhead font-medium', d.status === 'void' && 'text-label-3 line-through')} />
        <span className="flex items-center gap-1.5">
          {open && d.balance !== d.total && <span className="tabular text-caption text-label-2">{money(d.balance, d.currency)} left</span>}
          <StatusBadge status={d.status} overdue={d.is_overdue} />
        </span>
      </span>
    </Row>
  );
}

function shortDateSmart(iso: string) {
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? shortDate(iso) : date(iso);
}
