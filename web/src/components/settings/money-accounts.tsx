'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, CreditCard, Banknote, User, Wallet, Plus, type LucideIcon } from 'lucide-react';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextArea } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { money } from '@/lib/format';
import { saveAccount, setAccountArchived } from '@/app/(app)/settings/accounts/actions';
import { EditSheet, TextField, SelectField, useEditor } from './settings-form';
import { Swatches } from './swatches';
import type { Row as DbRow } from '@/lib/types';

type Account = DbRow<'money_accounts'> & { txns: number };

export const ACCOUNT_KINDS: Record<string, { label: string; icon: LucideIcon; group: string }> = {
  bank: { label: 'Bank account', icon: Landmark, group: 'Bank accounts' },
  credit_card: { label: 'Credit card', icon: CreditCard, group: 'Cards' },
  payment_processor: { label: 'Payment processor', icon: Wallet, group: 'Processors' },
  cash: { label: 'Cash', icon: Banknote, group: 'Cash' },
  personal: { label: 'Personal (owner’s own money)', icon: User, group: 'Owners’ personal money' },
};
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'INR'];

function validate(name: string, v: string, fd: FormData) {
  if (name === 'name') return v.trim() ? null : 'Give the account a name.';
  if (name === 'last4') return !v.trim() || /^\d{4}$/.test(v.trim()) ? null : 'Four digits.';
  if (name === 'owner_member_id') return fd.get('kind') === 'personal' && !v ? 'Choose an owner.' : null;
  if (name === 'opening_balance') return !v.trim() || Number.isFinite(Number(v.replace(/[$,\s]/g, ''))) ? null : 'Enter an amount.';
  return null;
}

export function MoneyAccounts({ accounts, members }: { accounts: Account[]; members: { id: string; full_name: string }[] }) {
  const ed = useEditor<Account>();
  const a = ed.item;
  const [kind, setKind] = useState('bank');
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const live = accounts.filter((x) => !x.archived);
  const archived = accounts.filter((x) => x.archived);
  const groups = Object.entries(ACCOUNT_KINDS).map(([k, meta]) => ({ k, meta, items: live.filter((x) => x.kind === k) })).filter((g) => g.items.length);
  const owner = (id: string | null) => members.find((m) => m.id === id)?.full_name;

  function edit(x: Account | null) {
    setKind(x?.kind ?? 'bank');
    ed.edit(x);
  }

  async function archive(x: Account, on: boolean) {
    const r = await setAccountArchived(x.id, on);
    if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
    toast({ title: on ? `${x.name} archived` : `${x.name} restored`, action: { label: 'Undo', onClick: async () => { await setAccountArchived(x.id, !on); start(() => router.refresh()); } } });
    start(() => router.refresh());
  }

  const row = (x: Account) => {
    const meta = ACCOUNT_KINDS[x.kind] ?? ACCOUNT_KINDS.bank!;
    return (
      <Row
        key={x.id}
        onClick={() => edit(x)}
        icon={<IconTile color={x.color ?? '#5B6B70'} fg={x.color === '#03DDAA' || x.color === '#9BB1B5' ? '#032920' : '#fff'}><meta.icon strokeWidth={2.2} /></IconTile>}
        title={<span className={x.archived ? 'text-label-3' : ''}>{x.name}</span>}
        subtitle={[x.institution, x.last4 && `•••• ${x.last4}`, x.kind === 'personal' || x.kind === 'credit_card' ? owner(x.owner_member_id) : null].filter(Boolean).join(' · ') || meta.label}
        value={x.currency !== 'CAD' ? x.currency : undefined}
      >
        {x.archived && <Badge>Archived</Badge>}
      </Row>
    );
  };

  return (
    <>
      <div className="mb-4 flex justify-end lg:-mt-2">
        <Button size="sm" variant="tinted" icon={<Plus className="size-4" />} onClick={() => edit(null)}>Add account</Button>
      </div>
      {groups.map((g) => (
        <Section key={g.k} title={g.meta.group} inset={58} footer={g.k === 'personal' ? 'Spending paid with an owner’s own money is tracked here so the company can pay them back.' : undefined}>
          {g.items.map(row)}
        </Section>
      ))}
      {archived.length > 0 && (
        <Section title="Archived" inset={58} footer="Archived accounts keep their history but can’t be picked for new records.">{archived.map(row)}</Section>
      )}

      <EditSheet
        key={ed.key}
        open={ed.open}
        onClose={ed.close}
        title={a ? 'Edit account' : 'New account'}
        saveLabel={a ? 'Save' : 'Add'}
        action={saveAccount}
        validate={validate}
        footer={a && (
          <Section>
            <Row title={a.archived ? 'Restore account' : 'Archive account'} destructive={!a.archived} onClick={() => { ed.close(); void archive(a, !a.archived); }} />
          </Section>
        )}
      >
        {a && <input type="hidden" name="id" value={a.id} />}
        {a && <input type="hidden" name="archived" value={a.archived ? 'on' : ''} />}
        <Section>
          <TextField name="name" label="Name" defaultValue={a?.name ?? ''} placeholder="EQ Bank Business" autoFocus={!a} />
          <SelectField name="kind" label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(ACCOUNT_KINDS).map(([value, m]) => ({ value, label: m.label }))} />
          {(kind === 'personal' || kind === 'credit_card') && (
            <SelectField
              name="owner_member_id"
              label={kind === 'personal' ? 'Owner' : 'Card holder'}
              defaultValue={a?.owner_member_id ?? ''}
              placeholder={kind === 'personal' ? 'Choose…' : 'Shared'}
              options={members.map((m) => ({ value: m.id, label: m.full_name }))}
            />
          )}
        </Section>
        {kind !== 'personal' && (
          <Section>
            <TextField name="institution" label="Institution" defaultValue={a?.institution ?? ''} placeholder="EQ Bank" />
            <TextField name="last4" label="Last 4 digits" defaultValue={a?.last4 ?? ''} inputMode="numeric" maxLength={4} placeholder="1234" />
          </Section>
        )}
        <Section footer={a?.txns ? `${a.txns} imported transactions — currency is locked.` : 'The balance before the first imported transaction.'}>
          <SelectField name="currency" label="Currency" defaultValue={a?.currency ?? 'CAD'} options={CURRENCIES.map((c) => ({ value: c, label: c }))} disabled={!!a?.txns} />
          {!!a?.txns && <input type="hidden" name="currency" value={a.currency} />}
          <TextField
            name="opening_balance"
            label="Opening balance"
            defaultValue={a ? String(Number(a.opening_balance)) : ''}
            placeholder={money(0)}
            inputMode="decimal"
            align="right"
          />
        </Section>
        <Section>
          <Swatches name="color" defaultValue={a?.color ?? '#0680A2'} />
          <TextArea name="notes" label="Notes" defaultValue={a?.notes ?? ''} rows={2} maxLength={500} placeholder="Optional" />
        </Section>
      </EditSheet>
    </>
  );
}
