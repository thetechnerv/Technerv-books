'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Car, Receipt, ShoppingBag } from 'lucide-react';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Section } from '@/components/ui/group';
import { AmountInput, Chips, Input, Select, Toggle } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { settleUp, deleteTransfer, reopenItems, type TransferKind } from '@/app/(app)/balances/actions';
import type { OpenItem } from './server';

type Member = { id: string; full_name: string; initials: string | null; color: string | null };

const KINDS: { value: TransferKind; label: string; hint: (who: string) => string }[] = [
  { value: 'reimbursement', label: 'Reimbursement', hint: (w) => `The company pays ${w} back. Lowers what the company owes ${w}.` },
  { value: 'repayment', label: 'Repayment', hint: (w) => `${w} pays the company back for personal charges. Clears shareholder-loan items.` },
  { value: 'contribution', label: 'Contribution', hint: (w) => `${w} puts money into the company (a shareholder loan to the company). The company owes it back.` },
  { value: 'dividend', label: 'Dividend', hint: () => 'Paid from after-tax profit; reported on a T5. Doesn’t change the loan balance.' },
  { value: 'salary', label: 'Salary', hint: () => 'Run through payroll (T4). Doesn’t change the loan balance.' },
  { value: 'other', label: 'Other', hint: () => 'Recorded for the history only — doesn’t change the balance.' },
];

export function SettleSheet({ open, members, defaultMemberId, accounts, openItems, balances, today, closeHref }: {
  open: boolean; members: Member[]; defaultMemberId: string; accounts: { id: string; name: string; kind: string }[];
  openItems: Record<string, OpenItem[]>; balances: Record<string, number>; today: string; closeHref: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const close = () => start(() => router.replace(closeHref, { scroll: false }));
  return (
    <SettleForm
      key={`${open}:${defaultMemberId}`}
      open={open}
      onClose={close}
      members={members}
      defaultMemberId={defaultMemberId}
      accounts={accounts}
      openItems={openItems}
      balances={balances}
      today={today}
    />
  );
}

function SettleForm({ open, onClose, members, defaultMemberId, accounts, openItems, balances, today }: {
  open: boolean; onClose: () => void; members: Member[]; defaultMemberId: string; accounts: { id: string; name: string; kind: string }[];
  openItems: Record<string, OpenItem[]>; balances: Record<string, number>; today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [memberId, setMemberId] = useState(defaultMemberId);
  const items = useMemo(() => openItems[memberId] ?? [], [openItems, memberId]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((openItems[defaultMemberId] ?? []).map((i) => i.id)));
  const net = useMemo(() => Math.round(items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.amount, 0) * 100) / 100, [items, selected]);
  const [kind, setKind] = useState<TransferKind>(net < 0 ? 'repayment' : 'reimbursement');
  const [kindTouched, setKindTouched] = useState(false);
  const [amount, setAmount] = useState(Math.abs(net));
  const [amountKey, setAmountKey] = useState(0);
  const [date, setDate] = useState(today);
  const bankDefault = accounts.find((a) => a.kind === 'bank')?.id ?? accounts[0]?.id ?? '';
  const [accountId, setAccountId] = useState(bankDefault);
  const [notes, setNotes] = useState('');
  const [offset, setOffset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const member = members.find((m) => m.id === memberId)!;
  const first = member.full_name.split(' ')[0]!;
  const usesItems = kind === 'reimbursement' || kind === 'repayment';
  const selectedItems = items.filter((i) => selected.has(i.id));

  function syncFromSelection(next: Set<string>, list = items) {
    const n = Math.round(list.filter((i) => next.has(i.id)).reduce((s, i) => s + i.amount, 0) * 100) / 100;
    setAmount(Math.abs(n));
    setAmountKey((k) => k + 1);
    if (!kindTouched || kind === 'reimbursement' || kind === 'repayment') setKind(n < 0 ? 'repayment' : 'reimbursement');
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    syncFromSelection(next);
  }
  function pickMember(id: string) {
    setMemberId(id);
    const list = openItems[id] ?? [];
    const next = new Set(list.map((i) => i.id));
    setSelected(next);
    setKindTouched(false);
    syncFromSelection(next, list);
  }

  const balanceAfter = (() => {
    const b = balances[memberId] ?? 0;
    if (offset) return b;
    if (kind === 'reimbursement') return b - amount;
    if (kind === 'repayment' || kind === 'contribution') return b + amount;
    return b;
  })();

  const summary = offset
    ? `No money moves. ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} are marked settled against ${first}’s running balance.`
    : kind === 'reimbursement' ? `The company pays ${first} ${money(amount)}.`
    : kind === 'repayment' ? `${first} pays the company ${money(amount)}.`
    : kind === 'contribution' ? `${first} puts ${money(amount)} into the company.`
    : `${money(amount)} ${kind} to ${first}.`;

  async function save() {
    setError(null);
    if (!offset && !(amount > 0)) return setError('Enter an amount.');
    setBusy(true);
    const expenseIds = usesItems ? selectedItems.filter((i) => i.type === 'expense').map((i) => i.id) : [];
    const tripIds = usesItems ? selectedItems.filter((i) => i.type === 'mileage').map((i) => i.id) : [];
    const r = await settleUp({ memberId, kind, amount, date, accountId: accountId || null, notes, expenseIds, tripIds, offset: offset && usesItems });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const transferId = r.data!.transferId;
    toast({
      title: offset ? `Offset ${r.data!.covered} items` : `${KINDS.find((k) => k.value === kind)!.label} of ${money(amount)} recorded${r.data!.covered ? ` · ${r.data!.covered} settled` : ''}`,
      action: {
        label: 'Undo',
        onClick: async () => {
          const u = transferId ? await deleteTransfer(transferId) : await reopenItems(memberId, expenseIds, tripIds);
          if (!u.ok) toast({ title: u.error, tone: 'error' });
          router.refresh();
        },
      },
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settle up"
      size="md"
      action={<SheetAction loading={busy} onClick={save}>{offset ? 'Offset' : 'Record'}</SheetAction>}
    >
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="pb-3 pt-1">
          <Segmented
            full
            options={members.map((m) => ({ value: m.id, label: <span className="flex items-center gap-1.5"><Avatar name={m.full_name} color={m.color} initials={m.initials} size={18} />{m.full_name.split(' ')[0]}</span> }))}
            value={memberId}
            onChange={pickMember}
          />
          <p className="mt-2 text-center text-footnote text-label-2">
            {(balances[memberId] ?? 0) >= 0 ? `Company owes ${first} ${money(balances[memberId] ?? 0)}` : `${first} owes the company ${money(-(balances[memberId] ?? 0))}`} overall
          </p>
        </div>

        <Section title="Kind" footer={KINDS.find((k) => k.value === kind)!.hint(first)}>
          <div className="p-3">
            <Chips options={KINDS.map((k) => ({ value: k.value, label: k.label }))} value={kind} onChange={(k) => { setKind(k); setKindTouched(true); if (k !== 'reimbursement' && k !== 'repayment') setOffset(false); }} />
          </div>
        </Section>

        {!offset && (
          <Section>
            <AmountInput key={amountKey} name="amount" defaultValue={amount ? amount.toFixed(2) : ''} onValue={setAmount} />
          </Section>
        )}

        {usesItems && (
          <Section
            title={items.length ? `Covers ${selectedItems.length} of ${items.length} open items` : 'Open items'}
            action={items.length > 1 ? (
              <button type="button" className="text-footnote font-medium text-accent-text" onClick={() => { const next = selected.size === items.length ? new Set<string>() : new Set(items.map((i) => i.id)); setSelected(next); syncFromSelection(next); }}>
                {selected.size === items.length ? 'Select none' : 'Select all'}
              </button>
            ) : undefined}
            inset={52}
            footer={items.length ? `Selected items net to ${net >= 0 ? `${money(net)} owed to ${first}` : `${money(-net)} owed by ${first}`}. They’re marked settled when you save.` : undefined}
          >
            {items.length === 0 && <p className="px-4 py-3 text-subhead text-label-2 lg:px-3">Nothing open for {first} — every expense and trip is settled.</p>}
            <div className="max-h-[280px] overflow-y-auto">
              {items.map((i) => {
                const on = selected.has(i.id);
                const I = i.type === 'mileage' ? Car : i.amount < 0 ? ShoppingBag : Receipt;
                return (
                  <button key={i.id} type="button" onClick={() => toggle(i.id)} className="row-press flex min-h-[52px] w-full items-center gap-3 px-4 text-left lg:px-3">
                    <span className={cn('flex size-[24px] shrink-0 items-center justify-center rounded-full border-[1.5px]', on ? 'border-accent bg-accent text-on-accent' : 'border-label-4')}>
                      {on && <Check className="size-3.5" strokeWidth={3.2} />}
                    </span>
                    <I className="size-4 shrink-0 text-label-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{i.label}</span>
                      <span className="block truncate text-footnote text-label-2">{i.date}{i.detail ? ` · ${i.detail}` : ''}</span>
                    </span>
                    <span className={cn('tabular shrink-0 text-subhead font-medium', i.amount < 0 ? 'text-orange' : 'text-accent-text')}>{money(i.amount, 'CAD', { sign: true })}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {usesItems && selectedItems.length > 0 && (
          <Section>
            <Toggle label="Offset only — no money moved" hint="Use when what the company owes and what's owed back cancel out, or to net against a contribution." checked={offset} onChange={setOffset} />
          </Section>
        )}

        <Section>
          <Input label="Date" type="date" align="right" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {!offset && (
            <Select
              label={kind === 'repayment' || kind === 'contribution' ? 'Into' : 'From'}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
          <Input label="Notes" align="right" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Section>

        <p className="mb-2 rounded-[12px] bg-accent-soft px-3 py-2.5 text-subhead font-medium text-accent-text">
          {summary} {balanceAfter >= 0 ? `Afterwards the company owes ${first} ${money(balanceAfter)}.` : `Afterwards ${first} owes the company ${money(-balanceAfter)}.`}
        </p>
        {error && <p className="mt-2 rounded-[12px] bg-red-soft px-3 py-2.5 text-subhead text-red" role="alert">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
