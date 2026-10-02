'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, ArrowRightLeft, CornerDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { money, num, shortDate, date } from '@/lib/format';
import { ClientTile } from './client-tile';
import { dueInfo, monthHeader, monthKey, statusLabel, toneClass } from './shared';
import { convertEstimate } from '@/app/(app)/invoices/actions';

export type ListRow = {
  id: string;
  number: string;
  kind: 'invoice' | 'estimate' | 'credit_note';
  status: string;
  client_id: string;
  client_name: string;
  title: string | null;
  issue_date: string;
  due_date: string | null;
  total: number;
  balance: number;
  currency: string;
  is_overdue: boolean;
  days_overdue: number;
  last_payment_on: string | null;
  converted_to?: string | null;
  converted_to_id?: string | null;
  fx_rate?: number;
};

type SortKey = 'issued' | 'number' | 'client' | 'due' | 'status' | 'amount';

/** Amount shown in the trailing column: what's still owed for open invoices, else the total. */
function shownAmount(r: ListRow) {
  if (r.kind === 'credit_note') return -Math.abs(num(r.total));
  if (r.kind === 'invoice' && (r.status === 'sent' || r.status === 'partial')) return num(r.balance);
  return num(r.total);
}

function Status({ r }: { r: ListRow }) {
  const s = statusLabel(r.kind, r.status, r.is_overdue);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function DocList({ rows, empty, grouped = true }: { rows: ListRow[]; empty: ReactNode; grouped?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'issued', dir: -1 });

  const sorted = useMemo(() => {
    const val = (r: ListRow): string | number => {
      switch (sort.key) {
        case 'number': return Number(r.number.replace(/\D/g, '')) || 0;
        case 'client': return r.client_name.toLowerCase();
        case 'due': return r.due_date ?? '9999';
        case 'status': return statusLabel(r.kind, r.status, r.is_overdue).label;
        case 'amount': return shownAmount(r);
        default: return r.issue_date + r.number.padStart(12, '0');
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  if (!rows.length) return <>{empty}</>;

  // Phones: newest first, grouped by month.
  const byMonth = new Map<string, ListRow[]>();
  for (const r of [...rows].sort((a, b) => (b.issue_date + b.number).localeCompare(a.issue_date + a.number))) {
    const k = monthKey(r.issue_date);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }

  return (
    <>
      <div className="lg:hidden">
        {[...byMonth.entries()].map(([k, list]) => (
          <section key={k} className="mb-6">
            <div className="mb-1.5 flex items-baseline justify-between px-4">
              <h2 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2">{monthHeader(k)}</h2>
              <span className="tabular text-footnote text-label-3">{monthTotal(list)}</span>
            </div>
            <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '64px' }}>
              {list.map((r) => <MobileRow key={r.id} r={r} />)}
            </div>
          </section>
        ))}
      </div>
      <DesktopTable rows={sorted} sort={sort} setSort={setSort} grouped={grouped && sort.key === 'issued'} />
    </>
  );
}

function monthTotal(list: ListRow[]) {
  const cur = new Set(list.map((r) => r.currency));
  if (cur.size !== 1) return '';
  const sum = list.filter((r) => r.status !== 'void' && r.status !== 'declined').reduce((s, r) => s + (r.kind === 'credit_note' ? -num(r.total) : num(r.total)), 0);
  return money(sum, [...cur][0], { cents: false });
}

function MobileRow({ r }: { r: ListRow }) {
  const due = r.converted_to ? { text: `Invoiced as ${r.converted_to}`, tone: 'accent' as const } : dueInfo(r);
  return (
    <Link href={`/invoices/${r.id}`} className="row-press flex items-center gap-3 px-4 py-2.5">
      <ClientTile id={r.client_id} name={r.client_name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{r.client_name}</span>
        <span className="block truncate text-subhead text-label-2">{r.number}{r.title ? ` · ${r.title}` : ''}</span>
        {due.text && <span className={cn('block truncate text-footnote', toneClass[due.tone])}>{due.text}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn('tabular font-semibold', r.status === 'void' && 'text-label-3 line-through')}>{money(shownAmount(r), r.currency)}</span>
        <Status r={r} />
      </span>
    </Link>
  );
}

function SortHead({ k, label, sort, setSort, align = 'left', className }: { k: SortKey; label: string; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; align?: 'left' | 'right'; className?: string }) {
  const on = sort.key === k;
  return (
    <th className={cn('sticky top-[var(--sticky-top)] z-10 bg-[var(--material-bar)] px-3 py-2 font-medium backdrop-blur-xl', align === 'right' && 'text-right', className)} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : k === 'issued' || k === 'amount' ? -1 : 1 })}
        className={cn('inline-flex items-center gap-1 rounded hover:text-label', on ? 'text-label' : 'text-label-2', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        {on && (sort.dir === 1 ? <ArrowUp className="size-3" strokeWidth={2.4} /> : <ArrowDown className="size-3" strokeWidth={2.4} />)}
      </button>
    </th>
  );
}

function DesktopTable({ rows, sort, setSort, grouped }: { rows: ListRow[]; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; grouped: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const isEst = rows.some((r) => r.kind === 'estimate');
  const headers = rows.map((r, i) => (grouped && (i === 0 || monthKey(rows[i - 1]!.issue_date) !== monthKey(r.issue_date)) ? monthHeader(monthKey(r.issue_date)) : null));

  async function copy(e: React.MouseEvent, n: string) {
    e.stopPropagation();
    e.preventDefault();
    try { await navigator.clipboard.writeText(n); toast({ title: `Copied ${n}` }); } catch { toast({ title: 'Couldn’t copy', tone: 'error' }); }
  }
  function convert(e: React.MouseEvent, r: ListRow) {
    e.stopPropagation();
    start(async () => {
      const res = await convertEstimate(r.id);
      if (!res.ok) return toast({ title: res.error, tone: 'error' });
      toast({ title: res.message ?? 'Converted' });
      router.push(`/invoices/${res.data!.id}`);
    });
  }

  return (
    <div className="hidden overflow-clip rounded-group bg-cell shadow-card lg:block">
      <table className="w-full border-collapse text-subhead">
        <thead className="text-left text-caption uppercase tracking-[0.04em]">
          <tr className="hairline-b">
            <SortHead k="number" label="Number" sort={sort} setSort={setSort} className="w-[120px] pl-4" />
            <SortHead k="client" label="Client" sort={sort} setSort={setSort} />
            <th className="sticky top-[var(--sticky-top)] z-10 bg-[var(--material-bar)] px-3 py-2 font-medium text-label-2 backdrop-blur-xl">Title</th>
            <SortHead k="issued" label="Issued" sort={sort} setSort={setSort} className="w-[96px]" />
            <SortHead k="due" label={isEst ? 'Valid until' : 'Due'} sort={sort} setSort={setSort} className="w-[150px]" />
            <SortHead k="status" label="Status" sort={sort} setSort={setSort} className="w-[110px]" />
            <SortHead k="amount" label="Amount" sort={sort} setSort={setSort} align="right" className="w-[130px] pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const due = dueInfo(r);
            return (
              <FragmentRows key={r.id} header={headers[i] ?? null}>
                <tr
                  onClick={() => router.push(`/invoices/${r.id}`)}
                  className="group cursor-default border-t-[0.5px] border-separator transition-colors hover:bg-fill-2"
                >
                  <td className="py-2 pl-4 pr-3">
                    <span className="inline-flex items-center gap-1">
                      <Link href={`/invoices/${r.id}`} onClick={(e) => e.stopPropagation()} className="tabular font-medium hover:underline">{r.number}</Link>
                      <button type="button" onClick={(e) => copy(e, r.number)} title="Copy number" aria-label={`Copy ${r.number}`} className="rounded p-0.5 text-label-3 opacity-0 hover:text-label group-hover:opacity-100 focus-visible:opacity-100">
                        <Copy className="size-3" />
                      </button>
                    </span>
                  </td>
                  <td className="max-w-[220px] px-3 py-2">
                    <span className="flex items-center gap-2">
                      <ClientTile id={r.client_id} name={r.client_name} size={22} />
                      <span className="truncate">{r.client_name}</span>
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-3 py-2 text-label-2">
                    {r.title}
                    {r.converted_to && <span className="ml-1.5 inline-flex items-center gap-0.5 text-caption text-label-3"><CornerDownRight className="size-3" />{r.converted_to}</span>}
                  </td>
                  <td className="tabular px-3 py-2 text-label-2" title={date(r.issue_date)}>{shortDate(r.issue_date)}</td>
                  <td className={cn('px-3 py-2', toneClass[due.tone])}>{due.text}</td>
                  <td className="px-3 py-2"><Status r={r} /></td>
                  <td className="py-2 pl-3 pr-4 text-right">
                    <span className="inline-flex items-center gap-2">
                      {r.kind === 'estimate' && !r.converted_to && (r.status === 'sent' || r.status === 'accepted') && (
                        <button type="button" disabled={pending} onClick={(e) => convert(e, r)} title="Convert to invoice" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-semibold text-accent-text opacity-0 hover:bg-accent-soft group-hover:opacity-100 focus-visible:opacity-100">
                          <ArrowRightLeft className="size-3" /> Convert
                        </button>
                      )}
                      <span className={cn('tabular font-medium', r.status === 'void' && 'text-label-3 line-through')}>{money(shownAmount(r), r.currency)}</span>
                    </span>
                  </td>
                </tr>
              </FragmentRows>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRows({ header, children }: { header: string | null; children: ReactNode }) {
  return (
    <>
      {header && (
        <tr>
          <td colSpan={7} className="bg-inset px-4 pb-1 pt-3 text-caption font-semibold uppercase tracking-[0.06em] text-label-3">{header}</td>
        </tr>
      )}
      {children}
    </>
  );
}
