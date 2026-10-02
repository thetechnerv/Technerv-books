'use client';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Section } from '@/components/ui/group';
import { Input, Select, TextArea } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { BigMoney } from '@/components/ui/money';
import { Switch } from '@/components/ui/fields';
import { date as fmtDate, money, round2 } from '@/lib/format';
import type { ExpenseNature, PaymentMethod } from '@/lib/types';
import type { ReviewItem, ReviewLookups } from './types';

type Submit<T> = (input: T) => Promise<string | null>;

function SheetHeaderAmount({ item, children }: { item: ReviewItem; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center pb-5 pt-2 text-center">
      <BigMoney value={Math.abs(item.amount)} currency={item.currency} className="text-[40px] leading-none lg:text-[34px]" />
      <p className="mt-2 max-w-[90%] truncate text-subhead text-label-2">{item.description}</p>
      <p className="text-footnote text-label-3">{fmtDate(item.postedOn)} · {item.accountName}</p>
      {children}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="mb-4 rounded-md bg-red-soft px-3 py-2 text-footnote text-red">{error}</p>;
}

const NATURE_OPTS: { value: ExpenseNature; label: string }[] = [
  { value: 'business', label: 'Business' }, { value: 'mixed', label: 'Mixed' }, { value: 'personal', label: 'Personal' },
];

export type ExpenseDraft = {
  vendor: string; description: string | null; spentOn: string; categoryId: string | null; nature: ExpenseNature; businessPct: number | null;
  spentBy: string; gst: number | null; ruleId: string | null; notes: string | null;
};

export function defaultExpenseDraft(item: ReviewItem, me: string): ExpenseDraft {
  return {
    vendor: item.vendor, description: null, spentOn: item.postedOn, categoryId: item.rule?.categoryId ?? null,
    nature: item.rule?.nature ?? 'business', businessPct: item.rule?.nature === 'mixed' ? 50 : null,
    spentBy: item.spentBy ?? me, gst: null, ruleId: item.rule?.ruleId ?? null, notes: null,
  };
}

/** New expense pre-filled from the bank row and its rule. */
export function ExpenseSheet({ item, lookups, me, open, onClose, onSubmit }: {
  item: ReviewItem; lookups: ReviewLookups; me: string; open: boolean; onClose: () => void; onSubmit: Submit<ExpenseDraft>;
}) {
  const [d, setD] = useState<ExpenseDraft>(() => defaultExpenseDraft(item, me));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const locked = lookups.lockBefore && d.spentOn < lookups.lockBefore;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!d.vendor.trim()) return setError('Add who you paid.');
    setBusy(true); setError(null);
    const err = await onSubmit(d);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet open={open} onClose={onClose} title="New expense" action={<SheetAction form="bank-expense" loading={busy}>Add</SheetAction>}>
      <form id="bank-expense" onSubmit={submit}>
        <SheetHeaderAmount item={item}>
          {item.rule && <p className="mt-2 rounded-full bg-accent-soft px-3 py-1 text-caption font-semibold text-accent-text">Filled in by the “{item.rule.matchText}” rule</p>}
        </SheetHeaderAmount>
        <ErrorLine error={error ?? (locked ? `The books are closed before ${fmtDate(lookups.lockBefore)}.` : null)} />
        <Section>
          <Input label="Vendor" name="vendor" value={d.vendor} onChange={(e) => set('vendor', e.target.value)} autoComplete="off" align="right" />
          <Input label="Date" name="spentOn" type="date" value={d.spentOn} onChange={(e) => set('spentOn', e.target.value)} align="right" />
          <Select label="Category" name="category" value={d.categoryId ?? ''} placeholder="Choose…" options={lookups.expenseCategories} onChange={(e) => set('categoryId', e.target.value || null)} />
          <Select label="Spent by" name="spentBy" value={d.spentBy} options={lookups.members} onChange={(e) => set('spentBy', e.target.value)} />
        </Section>
        <Section title="What was it for?" footer={d.nature === 'personal' ? 'Paid with business money for something personal — it goes on the owner’s balance as money they owe the company.' : d.nature === 'mixed' ? 'Only the business share counts toward deductions and GST credits.' : undefined}>
          <div className="p-2"><Segmented full options={NATURE_OPTS} value={d.nature} onChange={(v) => { set('nature', v); if (v === 'mixed' && !d.businessPct) set('businessPct', 50); }} /></div>
          {d.nature === 'mixed' && (
            <Input label="Business share" name="pct" inputMode="numeric" value={d.businessPct ?? ''} trailing="%" align="right"
              onChange={(e) => set('businessPct', e.target.value === '' ? null : Math.min(99, Math.max(0, Number(e.target.value.replace(/\D/g, '')))))} />
          )}
        </Section>
        <Section footer="From the receipt. Leave blank if there’s no GST/HST (e.g. foreign software).">
          <Input label="GST/HST" name="gst" inputMode="decimal" placeholder="0.00" value={d.gst ?? ''} align="right"
            onChange={(e) => set('gst', e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
        </Section>
        <Section>
          <TextArea name="notes" placeholder="Notes (optional)" rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
        </Section>
      </form>
    </Sheet>
  );
}

export type IncomeDraft = { source: string; description: string | null; categoryId: string | null; gst: number | null; receivedOn: string };

export function IncomeSheet({ item, lookups, open, onClose, onSubmit }: {
  item: ReviewItem; lookups: ReviewLookups; open: boolean; onClose: () => void; onSubmit: Submit<IncomeDraft>;
}) {
  const interest = /INTEREST/i.test(item.description);
  const interestCat = lookups.incomeCategories.find((c) => /interest/i.test(c.label))?.value ?? null;
  const otherCat = lookups.incomeCategories.find((c) => /^other/i.test(c.label))?.value ?? null;
  const [d, setD] = useState<IncomeDraft>(() => ({
    source: interest ? item.accountName.replace(/\s*(Business|USD).*$/i, '').trim() || 'Bank' : item.vendor,
    description: interest ? 'Interest on business savings' : null,
    categoryId: interest ? interestCat : otherCat, gst: null, receivedOn: item.postedOn,
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof IncomeDraft>(k: K, v: IncomeDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!d.source.trim()) return setError('Add who paid you.');
    setBusy(true); setError(null);
    const err = await onSubmit(d);
    setBusy(false);
    if (err) setError(err);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Record income" action={<SheetAction form="bank-income" loading={busy}>Record</SheetAction>}>
      <form id="bank-income" onSubmit={submit}>
        <SheetHeaderAmount item={item} />
        <ErrorLine error={error} />
        <Section footer="For money in that isn’t a client paying an invoice — bank interest, refunds, grants.">
          <Input label="From" name="source" value={d.source} onChange={(e) => set('source', e.target.value)} align="right" autoComplete="off" />
          <Input label="Date" name="receivedOn" type="date" value={d.receivedOn} onChange={(e) => set('receivedOn', e.target.value)} align="right" />
          <Select label="Category" name="category" value={d.categoryId ?? ''} placeholder="Choose…" options={lookups.incomeCategories} onChange={(e) => set('categoryId', e.target.value || null)} />
          <Input label="Description" name="description" value={d.description ?? ''} placeholder="Optional" onChange={(e) => set('description', e.target.value || null)} align="right" />
          <Input label="GST/HST" name="gst" inputMode="decimal" placeholder="0.00" value={d.gst ?? ''} align="right"
            onChange={(e) => set('gst', e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
        </Section>
      </form>
    </Sheet>
  );
}

export type PaymentDraft = { clientId: string; method: PaymentMethod; reference: string | null; allocations: { invoiceId: string; amount: number }[] };

const METHOD_OPTS: { value: PaymentMethod; label: string }[] = [
  { value: 'etransfer', label: 'Interac e-Transfer' }, { value: 'eft', label: 'EFT / direct deposit' }, { value: 'wire', label: 'Wire' },
  { value: 'cheque', label: 'Cheque' }, { value: 'card', label: 'Card' }, { value: 'stripe', label: 'Stripe' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' },
];
function guessMethod(desc: string): PaymentMethod {
  if (/E-?TRANSFER|INTERAC/i.test(desc)) return 'etransfer';
  if (/WIRE/i.test(desc)) return 'wire';
  if (/CHEQUE|CHQ/i.test(desc)) return 'cheque';
  if (/STRIPE/i.test(desc)) return 'stripe';
  if (/EFT|DIRECT DEP|PAYROLL/i.test(desc)) return 'eft';
  return 'other';
}

/** Oldest invoices first until the deposit runs out. */
function autoAllocate(invoices: ReviewLookups['openInvoices'], amount: number) {
  let left = round2(amount);
  const out: Record<string, number> = {};
  for (const i of invoices) {
    if (left <= 0) break;
    const a = round2(Math.min(i.balance, left));
    out[i.id] = a; left = round2(left - a);
  }
  return out;
}

export function PaymentSheet({ item, lookups, open, onClose, onSubmit }: {
  item: ReviewItem; lookups: ReviewLookups; open: boolean; onClose: () => void; onSubmit: Submit<PaymentDraft>;
}) {
  const clients = lookups.clients.filter((c) => c.currency === item.currency);
  const [clientId, setClientId] = useState(item.clientGuess ?? '');
  const [method, setMethod] = useState<PaymentMethod>(guessMethod(item.description));
  const [reference, setReference] = useState(item.description.trim());
  const invoices = useMemo(() => lookups.openInvoices.filter((i) => i.clientId === clientId && i.currency === item.currency), [lookups.openInvoices, clientId, item.currency]);
  const [alloc, setAlloc] = useState<Record<string, number>>(() => autoAllocate(lookups.openInvoices.filter((i) => i.clientId === item.clientGuess && i.currency === item.currency), item.amount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allocated = round2(Object.entries(alloc).filter(([id]) => invoices.some((i) => i.id === id)).reduce((s, [, v]) => s + v, 0));
  const left = round2(item.amount - allocated);

  function pickClient(id: string) {
    setClientId(id);
    setAlloc(autoAllocate(lookups.openInvoices.filter((i) => i.clientId === id && i.currency === item.currency), item.amount));
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!clientId) return setError('Choose the client who paid.');
    if (left < -0.001) return setError('You’ve allocated more than the deposit.');
    setBusy(true); setError(null);
    const err = await onSubmit({ clientId, method, reference: reference || null, allocations: invoices.filter((i) => (alloc[i.id] ?? 0) > 0).map((i) => ({ invoiceId: i.id, amount: alloc[i.id]! })) });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Client payment" action={<SheetAction form="bank-payment" loading={busy}>Record</SheetAction>}>
      <form id="bank-payment" onSubmit={submit}>
        <SheetHeaderAmount item={item} />
        <ErrorLine error={error} />
        <Section>
          <Select label="Client" name="client" value={clientId} placeholder="Choose…" options={clients} onChange={(e) => pickClient(e.target.value)} />
          <Select label="Method" name="method" value={method} options={METHOD_OPTS} onChange={(e) => setMethod(e.target.value as PaymentMethod)} />
          <Input label="Reference" name="reference" value={reference} onChange={(e) => setReference(e.target.value)} align="right" />
        </Section>
        {clientId && (
          <Section title="Apply to invoices" footer={invoices.length === 0 ? 'This client has no open invoices. The payment is recorded as a credit you can apply later.' : left > 0 ? `${money(left, item.currency)} stays unallocated as a credit.` : 'The whole deposit is applied.'}>
            {invoices.map((i) => {
              const on = (alloc[i.id] ?? 0) > 0;
              return (
                <div key={i.id} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                  <Switch label={`Apply to ${i.number}`} on={on} onChange={(v) => setAlloc((a) => ({ ...a, [i.id]: v ? round2(Math.min(i.balance, Math.max(0, left))) : 0 }))} />
                  <div className="min-w-0 flex-1 py-2">
                    <div className="font-medium">{i.number}</div>
                    <div className="text-footnote text-label-2">Balance {money(i.balance, i.currency)}{i.dueDate ? ` · due ${fmtDate(i.dueDate, 'MMM d')}` : ''}</div>
                  </div>
                  <input
                    aria-label={`Amount for ${i.number}`} inputMode="decimal" disabled={!on}
                    value={on ? String(alloc[i.id]) : ''} placeholder="0.00"
                    onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: Math.min(i.balance, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) }))}
                    className="tabular w-24 rounded-md bg-fill px-2 py-1.5 text-right outline-none disabled:opacity-40"
                  />
                </div>
              );
            })}
          </Section>
        )}
      </form>
    </Sheet>
  );
}

export type TransferDraft = { counterpartAccountId: string | null; note: string | null };

export function TransferSheet({ item, lookups, open, onClose, onSubmit }: {
  item: ReviewItem; lookups: ReviewLookups; open: boolean; onClose: () => void; onSubmit: Submit<TransferDraft>;
}) {
  const [acct, setAcct] = useState(item.transferTo?.accountId ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const others = lookups.accounts.filter((a) => a.value !== item.accountId);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    const err = await onSubmit({ counterpartAccountId: acct || null, note: note || null });
    setBusy(false);
    if (err) setError(err);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Transfer" fit action={<SheetAction form="bank-transfer" loading={busy}>Done</SheetAction>}>
      <form id="bank-transfer" onSubmit={submit}>
        <SheetHeaderAmount item={item} />
        <ErrorLine error={error} />
        <Section footer="Moving money between your own accounts isn’t income or an expense, so it’s set aside with a note. If the other side is waiting for review, it’s set aside too.">
          <Select label={item.amount < 0 ? 'To' : 'From'} name="account" value={acct} placeholder="Somewhere else" options={others} onChange={(e) => setAcct(e.target.value)} />
          <Input label="Note" name="note" value={note} placeholder={item.amount < 0 ? 'e.g. Card bill payment' : 'Optional'} onChange={(e) => setNote(e.target.value)} align="right" />
        </Section>
      </form>
    </Sheet>
  );
}
