'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Section } from '@/components/ui/group';
import { AmountInput, Input, Select, TextArea, Chips } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { date, money, shortDate } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import { PAYMENT_METHODS } from './shared';
import { savePayment } from '@/app/(app)/payments/actions';

export type PaymentFormData = {
  clients: { id: string; display_name: string; currency: string }[];
  invoices: { id: string; number: string; client_id: string; currency: string; issue_date: string; due_date: string | null; balance: number; total: number; title: string | null }[];
  accounts: { id: string; name: string; currency: string; kind: string }[];
  rates: { currency: string; date: string; rate: number }[];
  lockBefore: string | null;
  today: string;
};

export type PaymentEdit = {
  id: string; client_id: string | null; received_on: string; amount: number; currency: string; fx_rate: number; method: PaymentMethod;
  deposit_account_id: string | null; reference: string | null; notes: string | null; allocations: { invoice_id: string; amount: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const QUICK_METHODS = PAYMENT_METHODS.filter((m) => m.value !== 'stripe');

/** Oldest-first allocation, starting with a preferred invoice when given. */
function autoAllocate(amount: number, invoices: { id: string; available: number }[], prefer?: string | null) {
  const order = prefer ? [...invoices.filter((i) => i.id === prefer), ...invoices.filter((i) => i.id !== prefer)] : invoices;
  let left = r2(amount);
  const out: Record<string, string> = {};
  for (const i of order) {
    const a = r2(Math.min(left, i.available));
    out[i.id] = a > 0 ? a.toFixed(2) : '';
    left = r2(left - Math.max(a, 0));
  }
  return out;
}

export function RecordPaymentSheet({ open, onClose, data, clientId: initialClient, invoiceId, edit, onSaved }: {
  open: boolean; onClose: () => void; data: PaymentFormData; clientId?: string | null; invoiceId?: string | null; edit?: PaymentEdit | null; onSaved?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Edit payment' : 'Record payment'} size="md" action={<SheetAction form="payment-form">Save</SheetAction>}>
      {open && <PaymentForm key={edit?.id ?? `${initialClient}-${invoiceId}`} data={data} initialClient={initialClient ?? null} invoiceId={invoiceId ?? null} edit={edit ?? null} onDone={(id) => { onClose(); onSaved?.(id); }} />}
    </Sheet>
  );
}

function PaymentForm({ data, initialClient, invoiceId, edit, onDone }: { data: PaymentFormData; initialClient: string | null; invoiceId: string | null; edit: PaymentEdit | null; onDone: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const preferInv = invoiceId ? data.invoices.find((i) => i.id === invoiceId) : null;
  const [clientId, setClientId] = useState<string>(edit?.client_id ?? preferInv?.client_id ?? initialClient ?? '');
  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const currency = client?.currency ?? edit?.currency ?? 'CAD';
  const prior = useMemo(() => new Map((edit?.allocations ?? []).map((a) => [a.invoice_id, a.amount])), [edit]);

  const invoices = useMemo(
    () => data.invoices.filter((i) => i.client_id === clientId && i.currency === currency)
      .map((i) => ({ ...i, available: r2(i.balance + (prior.get(i.id) ?? 0)) }))
      .filter((i) => i.available > 0),
    [data.invoices, clientId, currency, prior],
  );
  const owing = r2(invoices.reduce((s, i) => s + i.available, 0));
  const defaultAmount = edit?.amount ?? (preferInv && preferInv.client_id === clientId ? r2(preferInv.balance) : owing);

  const [amount, setAmount] = useState<number>(defaultAmount);
  const [amountKey, setAmountKey] = useState(0);
  const [alloc, setAlloc] = useState<Record<string, string>>(() =>
    edit ? Object.fromEntries(edit.allocations.map((a) => [a.invoice_id, a.amount.toFixed(2)])) : autoAllocate(defaultAmount, invoices, invoiceId));
  const [manual, setManual] = useState(!!edit);
  const [on, setOn] = useState(edit?.received_on ?? data.today);
  const [method, setMethod] = useState<PaymentMethod>(edit?.method ?? (currency === 'USD' ? 'wire' : 'etransfer'));
  const pickAccount = (cur: string) => data.accounts.find((a) => a.kind === 'bank' && a.currency === cur)?.id ?? data.accounts.find((a) => a.currency === cur)?.id ?? '';
  const [account, setAccount] = useState<string>(edit?.deposit_account_id ?? pickAccount(currency));
  const [reference, setReference] = useState(edit?.reference ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const rateFor = (d: string) => data.rates.find((r) => r.currency === currency && r.date <= d)?.rate ?? data.rates.find((r) => r.currency === currency)?.rate ?? 1.4;
  const [fx, setFx] = useState<string>(edit && edit.currency !== 'CAD' ? String(edit.fx_rate) : currency === 'CAD' ? '1' : String(rateFor(on)));
  const [fxTouched, setFxTouched] = useState(!!edit);
  const [error, setError] = useState<string | null>(null);

  // Re-default when the client changes (new payments only).
  function changeClient(id: string) {
    setClientId(id);
    const c = data.clients.find((x) => x.id === id);
    const cur = c?.currency ?? 'CAD';
    const list = data.invoices.filter((i) => i.client_id === id && i.currency === cur).map((i) => ({ id: i.id, available: r2(i.balance + (prior.get(i.id) ?? 0)) })).filter((i) => i.available > 0);
    const total = r2(list.reduce((s, i) => s + i.available, 0));
    setAmount(total);
    setAmountKey((k) => k + 1);
    setAlloc(autoAllocate(total, list));
    setManual(false);
    setAccount(pickAccount(cur));
    setMethod(cur === 'USD' ? 'wire' : 'etransfer');
    setFx(cur === 'CAD' ? '1' : String(data.rates.find((r) => r.currency === cur && r.date <= on)?.rate ?? 1.4));
  }

  function changeDate(d: string) {
    setOn(d);
    if (!fxTouched && currency !== 'CAD') setFx(String(rateFor(d)));
  }

  function onAmount(v: number) {
    setAmount(v);
    if (!manual) setAlloc(autoAllocate(v, invoices, invoiceId));
  }

  const applied = r2(invoices.reduce((s, i) => s + (Number(alloc[i.id]) || 0), 0));
  const unapplied = r2(amount - applied);
  const locked = !!data.lockBefore && on < data.lockBefore;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return setError('Choose who paid.');
    if (!(amount > 0)) return setError('Enter the amount received.');
    if (applied > amount + 0.001) return setError(`You’ve applied ${money(applied, currency)} but only ${money(amount, currency)} was received.`);
    if (locked) return setError(`The books are closed before ${date(data.lockBefore)}.`);
    setError(null);
    start(async () => {
      const res = await savePayment({
        id: edit?.id ?? null, client_id: clientId, received_on: on, amount, fx_rate: Number(fx), method, deposit_account_id: account || null,
        reference, notes, allocations: invoices.map((i) => ({ invoice_id: i.id, amount: Number(alloc[i.id]) || 0 })).filter((a) => a.amount > 0),
      });
      if (!res.ok) { setError(res.error); return; }
      toast({ title: res.message ?? 'Saved' });
      router.refresh();
      onDone(res.data!.id);
    });
  }

  return (
    <form id="payment-form" onSubmit={submit} className="pb-4">
      <AmountInput key={amountKey} name="amount" currency={currency} defaultValue={amount ? amount.toFixed(2) : ''} onValue={onAmount} autoFocus={!edit} />
      {client && owing > 0 && !edit && (
        <p className="-mt-3 mb-4 text-center text-footnote text-label-2">
          {money(owing, currency)} open across {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
          {amount !== owing && <button type="button" onClick={() => { onAmount(owing); setAmountKey((k) => k + 1); }} className="ml-1.5 font-medium text-accent-text">Use full amount</button>}
        </p>
      )}

      <Section>
        <Select label="From" value={clientId} onChange={(e) => changeClient(e.target.value)} placeholder="Choose client" options={data.clients.map((c) => ({ value: c.id, label: c.display_name + (c.currency !== 'CAD' ? ` (${c.currency})` : '') }))} />
        <Input label="Received" type="date" value={on} max={data.today} onChange={(e) => e.target.value && changeDate(e.target.value)} align="right" error={locked ? `Books are closed before ${date(data.lockBefore)}.` : null} />
      </Section>

      {client && (
        <Section
          title="Apply to"
          action={manual && invoices.length > 0 ? <button type="button" onClick={() => { setManual(false); setAlloc(autoAllocate(amount, invoices, invoiceId)); }} className="text-footnote font-medium text-accent-text">Auto (oldest first)</button> : undefined}
          footer={invoices.length === 0 ? undefined : unapplied > 0.004 ? `${money(unapplied, currency)} won’t be applied to an invoice — it stays on the payment as a credit.` : unapplied < -0.004 ? <span className="text-red">That’s {money(-unapplied, currency)} more than was received.</span> : 'Fully applied.'}
        >
          {invoices.length === 0 && <div className="px-4 py-4 text-subhead text-label-2 lg:px-3">No open invoices for {client.display_name}. The payment will be recorded unapplied.</div>}
          {invoices.map((i) => {
            const v = alloc[i.id] ?? '';
            const checked = Number(v) > 0;
            return (
              <div key={i.id} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-1.5 lg:px-3">
                <button
                  type="button"
                  aria-label={checked ? `Don’t apply to ${i.number}` : `Apply to ${i.number}`}
                  onClick={() => { setManual(true); setAlloc((a) => ({ ...a, [i.id]: checked ? '' : Math.min(i.available, Math.max(0, r2(amount - applied))).toFixed(2) })); }}
                  className={cn('flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors', checked ? 'bg-accent text-on-accent' : 'shadow-[inset_0_0_0_1.5px_var(--label-4)]')}
                >
                  {checked && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-medium">{i.number}{i.title ? <span className="font-normal text-label-2"> · {i.title}</span> : null}</span>
                  <span className="block text-footnote text-label-3">{money(i.available, currency)} open{i.due_date ? ` · due ${shortDate(i.due_date)}` : ''}</span>
                </span>
                <input
                  value={v}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount for ${i.number}`}
                  onChange={(e) => { setManual(true); setAlloc((a) => ({ ...a, [i.id]: e.target.value.replace(/[^\d.]/g, '') })); }}
                  className="tabular h-9 w-[104px] rounded-[10px] bg-fill-2 px-2.5 text-right outline-none focus:bg-fill lg:h-8 lg:rounded-md"
                />
              </div>
            );
          })}
        </Section>
      )}

      <div className="mb-2 px-1 text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:text-caption">Method</div>
      <Chips className="mb-5" options={QUICK_METHODS} value={method} onChange={setMethod} />

      <Section>
        <Select label="Deposited to" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Not tracked" options={data.accounts.map((a) => ({ value: a.id, label: a.name + (a.currency !== 'CAD' ? ` (${a.currency})` : '') }))} />
        {currency !== 'CAD' && (
          <Input
            label="Rate to CAD" inputMode="decimal" value={fx} align="right"
            onChange={(e) => { setFxTouched(true); setFx(e.target.value.replace(/[^\d.]/g, '')); }}
            hint={Number(fx) > 0 ? `1 ${currency} = ${Number(fx).toFixed(4)} CAD · ≈ ${money(amount * Number(fx))} CAD` : 'Bank of Canada rate for the day it arrived'}
          />
        )}
        <Input label="Reference" placeholder={method === 'cheque' ? 'Cheque #' : 'e.g. CA1234XYZ'} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
      </Section>
      <Section>
        <TextArea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Section>
      {error && <p role="alert" className="mb-3 px-1 text-subhead text-red">{error}</p>}
      <button type="submit" disabled={pending} className="pressable flex h-[50px] w-full items-center justify-center rounded-[14px] bg-accent text-headline font-semibold text-on-accent disabled:opacity-50 lg:h-10 lg:rounded-md lg:text-body">
        {pending ? 'Saving…' : edit ? 'Save changes' : `Record ${amount > 0 ? money(amount, currency) : 'payment'}`}
      </button>
    </form>
  );
}
