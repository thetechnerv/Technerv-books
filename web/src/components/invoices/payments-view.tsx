'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, FileText, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Button, IconButton } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { BigMoney } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { cn } from '@/lib/cn';
import { date, money, shortDate } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import { ClientTile } from './client-tile';
import { methodLabel, monthHeader, monthKey } from './shared';
import { RecordPaymentSheet, type PaymentEdit, type PaymentFormData } from './payment-sheet';
import { deletePayment } from '@/app/(app)/payments/actions';

export type PaymentRow = {
  id: string; client_id: string | null; client_name: string; received_on: string; amount: number; currency: string; fx_rate: number;
  method: PaymentMethod; deposit_account_id: string | null; account_name: string | null; reference: string | null; notes: string | null;
  allocations: { invoice_id: string; number: string; amount: number }[];
};

/** Nav-bar buttons: client filter + record payment. Opens the sheet from ?new=1. */
export function PaymentsActions({ clients, clientId, data }: { clients: { id: string; name: string }[]; clientId: string | null; data: PaymentFormData }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get('new') === '1');
  const href = (id: string | null) => {
    const p = new URLSearchParams(params.toString());
    p.delete('new'); p.delete('id'); p.delete('invoice');
    if (id) p.set('client', id); else p.delete('client');
    return `/payments${p.size ? `?${p}` : ''}`;
  };
  function close() {
    setOpen(false);
    if (params.get('new')) {
      const p = new URLSearchParams(params.toString());
      p.delete('new'); p.delete('invoice');
      router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
    }
  }
  const current = clients.find((c) => c.id === clientId);
  return (
    <>
      <Menu
        label="Filter by client"
        trigger={
          <button type="button" className={cn('pressable inline-flex h-8 max-w-[160px] items-center gap-1 rounded-full px-3 text-subhead font-medium', current ? 'bg-accent-soft text-accent-text' : 'text-accent-text hover:bg-fill-2')}>
            <span className="truncate">{current?.name ?? 'All clients'}</span><ChevronDown className="size-4 shrink-0" />
          </button>
        }
        items={[{ label: 'All clients', href: href(null) }, 'separator', ...clients.map((c) => ({ label: c.name, href: href(c.id) }))]}
      />
      <IconButton label="Record payment" onClick={() => setOpen(true)} className="lg:hidden"><Plus className="size-[22px]" strokeWidth={2.4} /></IconButton>
      <Button variant="filled" size="sm" icon={<Plus className="size-4" strokeWidth={2.6} />} onClick={() => setOpen(true)} className="hidden lg:inline-flex" title="Record payment">Record payment</Button>
      <RecordPaymentSheet open={open} onClose={close} data={data} clientId={params.get('client') ?? clientId} invoiceId={params.get('invoice')} />
    </>
  );
}

export function PaymentsList({ rows, data, empty }: { rows: PaymentRow[]; data: PaymentFormData; empty: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const linked = params.get('id');
  const [picked, setPicked] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentEdit | null>(null);
  // Deep link: /payments?id=<payment> opens its sheet and highlights the row.
  const selected = picked ?? (linked && linked !== dismissed ? linked : null);
  const setSelected = setPicked;

  useEffect(() => {
    if (linked) requestAnimationFrame(() => document.getElementById(`pay-${linked}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [linked]);

  function closeDetail() {
    setPicked(null);
    setDismissed(linked);
    if (params.get('id')) {
      const p = new URLSearchParams(params.toString());
      p.delete('id');
      router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
    }
  }

  if (!rows.length) return <>{empty}</>;
  const sel = rows.find((r) => r.id === selected) ?? null;

  const byMonth = new Map<string, PaymentRow[]>();
  for (const r of rows) byMonth.set(monthKey(r.received_on), [...(byMonth.get(monthKey(r.received_on)) ?? []), r]);

  return (
    <>
      {[...byMonth.entries()].map(([k, list]) => {
        const cad = list.reduce((s, r) => s + r.amount * r.fx_rate, 0);
        return (
          <section key={k} className="mb-6">
            <div className="mb-1.5 flex items-baseline justify-between px-4 lg:px-1">
              <h2 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:text-caption">{monthHeader(k)}</h2>
              <span className="tabular text-footnote text-label-3">{list.length} · {money(cad)}</span>
            </div>
            <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '64px' }}>
              {list.map((r) => {
                const applied = r.allocations.reduce((s, a) => s + a.amount, 0);
                const unapplied = Math.round((r.amount - applied) * 100) / 100;
                return (
                  <button
                    key={r.id}
                    id={`pay-${r.id}`}
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn('row-press flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-700 lg:px-3 lg:py-2 lg:hover:bg-fill-2', linked === r.id && 'bg-accent-soft')}
                  >
                    <ClientTile id={r.client_id} name={r.client_name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.client_name}</span>
                      <span className="block truncate text-subhead text-label-2">
                        {r.allocations.length ? r.allocations.map((a) => a.number).join(', ') : 'Not applied'}{r.reference ? ` · ${r.reference}` : ''}
                      </span>
                      <span className="block text-footnote text-label-3 lg:hidden">{methodLabel(r.method)} · {shortDate(r.received_on)}</span>
                    </span>
                    <span className="hidden w-[110px] shrink-0 text-subhead text-label-2 lg:block">{methodLabel(r.method)}</span>
                    <span className="hidden w-[150px] shrink-0 truncate text-subhead text-label-2 lg:block">{r.account_name ?? '—'}</span>
                    <span className="hidden w-[70px] shrink-0 text-subhead text-label-2 lg:block">{shortDate(r.received_on)}</span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 lg:w-[120px]">
                      <span className="tabular font-semibold text-accent-text">+{money(r.amount, r.currency)}</span>
                      {unapplied > 0.004 && <Badge tone="orange">{money(unapplied, r.currency)} unapplied</Badge>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <PaymentDetail p={sel} onClose={closeDetail} onEdit={(p) => { closeDetail(); setEditing({ ...p, allocations: p.allocations.map(({ invoice_id, amount }) => ({ invoice_id, amount })) }); }} />
      <RecordPaymentSheet open={!!editing} onClose={() => setEditing(null)} data={data} edit={editing} />
    </>
  );
}

function PaymentDetail({ p, onClose, onEdit }: { p: PaymentRow | null; onClose: () => void; onEdit: (p: PaymentRow) => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  async function remove() {
    if (!p) return;
    const nums = p.allocations.map((a) => a.number).join(', ');
    if (!(await confirm({ title: 'Delete this payment?', message: nums ? `${nums} will show as unpaid again.` : 'It will be removed from your records.', confirmLabel: 'Delete', destructive: true }))) return;
    start(async () => {
      const r = await deletePayment(p.id);
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({ title: r.message ?? 'Deleted' });
      onClose();
      router.refresh();
    });
  }
  const applied = p ? p.allocations.reduce((s, a) => s + a.amount, 0) : 0;
  return (
    <Sheet open={!!p} onClose={onClose} title="Payment" size="sm" fit cancelLabel="Done" action={p ? <button type="button" onClick={() => onEdit(p)} className="pressable -mr-1 rounded-full px-1 py-1 text-body font-semibold text-accent-text lg:text-subhead">Edit</button> : null}>
      {p && (
        <div className="pb-2">
          <div className="flex flex-col items-center py-4 text-center">
            <IconTile color="var(--accent)" fg="var(--on-accent)" size={44}><HandCoins /></IconTile>
            <BigMoney value={p.amount} currency={p.currency} className="mt-3 text-[38px] leading-[44px]" />
            <p className="mt-1 text-subhead text-label-2">from {p.client_name} · {date(p.received_on)}</p>
            {p.currency !== 'CAD' && <p className="text-footnote text-label-3">≈ {money(p.amount * p.fx_rate)} CAD at {p.fx_rate.toFixed(4)}</p>}
          </div>
          <Section>
            <Row title="Method" value={methodLabel(p.method)} />
            <Row title="Deposited to" value={p.account_name ?? 'Not tracked'} />
            {p.reference && <Row title="Reference" value={p.reference} />}
          </Section>
          <Section title="Applied to" inset={58} footer={p.amount - applied > 0.004 ? `${money(p.amount - applied, p.currency)} isn’t applied to an invoice.` : undefined}>
            {p.allocations.map((a) => (
              <Row key={a.invoice_id} href={`/invoices/${a.invoice_id}`} icon={<IconTile color="var(--teal)"><FileText /></IconTile>} title={a.number} value={money(a.amount, p.currency)} />
            ))}
            {!p.allocations.length && <div className="px-4 py-3.5 text-subhead text-label-2 lg:px-3">Not applied to any invoice.</div>}
          </Section>
          {p.notes && <Section title="Notes"><p className="whitespace-pre-wrap px-4 py-3 text-subhead lg:px-3">{p.notes}</p></Section>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="gray" size="lg" icon={<Pencil className="size-4" />} onClick={() => onEdit(p)}>Edit</Button>
            <Button variant="destructive-tinted" size="lg" icon={<Trash2 className="size-4" />} loading={pending} onClick={remove}>Delete</Button>
          </div>
          <p className="mt-3 text-center text-footnote text-label-3">
            Matched in banking? <Link href="/banking/review" className="text-accent-text">Review transactions</Link>
          </p>
        </div>
      )}
    </Sheet>
  );
}
