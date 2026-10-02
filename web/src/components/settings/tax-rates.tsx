'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { saveTaxRate, setTaxRateActive } from '@/app/(app)/settings/tax/actions';
import { EditSheet, TextField, SelectField, useEditor } from './settings-form';
import { PROVINCES } from './validate';
import type { Row as DbRow } from '@/lib/types';

type Rate = DbRow<'tax_rates'> & { lines: number };

const KIND_LABEL: Record<string, string> = { gst: 'GST', hst: 'HST', pst: 'PST', zero: 'Zero-rated', exempt: 'Exempt' };

function validate(name: string, v: string) {
  if (name === 'code') return /^[A-Za-z0-9-]{2,12}$/.test(v.trim()) ? null : '2–12 letters, numbers or dashes.';
  if (name === 'name') return v.trim() ? null : 'Give the rate a name.';
  if (name === 'rate') {
    const n = Number(v.replace('%', '').trim());
    return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 30 ? null : 'Enter a percentage between 0 and 30.';
  }
  return null;
}

export function TaxRates({ rates, defaultCode }: { rates: Rate[]; defaultCode: string }) {
  const ed = useEditor<Rate>();
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const current = ed.item;
  const active = rates.filter((r) => r.active);
  const inactive = rates.filter((r) => !r.active);

  async function toggleActive(r: Rate, on: boolean) {
    const res = await setTaxRateActive(r.id, on);
    if (!res.ok) { toast({ title: res.error, tone: 'error' }); return; }
    toast({ title: on ? `${r.code} reactivated` : `${r.code} deactivated`, action: { label: 'Undo', onClick: async () => { await setTaxRateActive(r.id, !on); start(() => router.refresh()); } } });
    start(() => router.refresh());
  }

  const row = (r: Rate) => (
    <Row
      key={r.id}
      onClick={() => ed.edit(r)}
      icon={<span className="tabular flex h-[30px] min-w-[54px] items-center justify-center rounded-[8px] bg-fill px-1.5 text-caption font-bold tracking-wide text-label-2 lg:h-[26px]">{r.code}</span>}
      title={<span className={r.active ? '' : 'text-label-3'}>{r.name}</span>}
      subtitle={[KIND_LABEL[r.kind], r.province, r.is_recoverable ? 'ITC eligible' : 'Not recoverable'].filter(Boolean).join(' · ')}
      value={<span className="tabular">{(Number(r.rate) * 100).toFixed(Number(r.rate) * 100 % 1 ? 2 : 0)}%</span>}
    >
      {r.code === defaultCode && <Badge tone="accent">Default</Badge>}
    </Row>
  );

  return (
    <>
      <Section
        title="Tax rates"
        inset={82}
        action={<Button size="sm" variant="plain" icon={<Plus className="size-4" />} onClick={() => ed.edit(null)}>Add rate</Button>}
        footer="Rates on invoice lines and products. A rate already used on invoices keeps its percentage — add a new rate when the law changes."
      >
        {active.map(row)}
      </Section>
      {inactive.length > 0 && (
        <Section title="Inactive" inset={82}>{inactive.map(row)}</Section>
      )}

      <EditSheet
        key={ed.key}
        open={ed.open}
        onClose={ed.close}
        title={current ? 'Edit tax rate' : 'New tax rate'}
        saveLabel={current ? 'Save' : 'Add'}
        action={saveTaxRate}
        validate={validate}
        footer={current && (
          <div className="mt-2">
            <Section>
              <Row
                title={current.active ? 'Deactivate rate' : 'Reactivate rate'}
                destructive={current.active}
                onClick={() => { ed.close(); void toggleActive(current, !current.active); }}
              />
            </Section>
          </div>
        )}
      >
        {current && <input type="hidden" name="id" value={current.id} />}
        <Section>
          <TextField name="code" label="Code" defaultValue={current?.code ?? ''} placeholder="HST-ON" autoCapitalize="characters" spellCheck={false} autoFocus={!current} />
          <TextField name="name" label="Name" defaultValue={current?.name ?? ''} placeholder="HST 13% (Ontario)" />
          <TextField
            name="rate"
            label="Rate"
            defaultValue={current ? String(Math.round(Number(current.rate) * 10000) / 100) : ''}
            placeholder="5"
            inputMode="decimal"
            align="right"
            trailing="%"
            readOnly={!!current?.lines}
            hint={current?.lines ? `Used on ${current.lines} invoice lines — locked.` : undefined}
          />
        </Section>
        <Section>
          <SelectField name="kind" label="Type" defaultValue={current?.kind ?? 'gst'} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
          <SelectField name="province" label="Province" defaultValue={current?.province ?? ''} placeholder="All provinces" options={PROVINCES.map(([v, l]) => ({ value: v, label: l }))} />
        </Section>
        <Section footer="Recoverable tax paid on expenses counts toward input tax credits. BC PST is not recoverable.">
          <Toggle name="is_recoverable" label="Recoverable (ITC)" defaultChecked={current?.is_recoverable ?? true} />
          <Toggle name="active" label="Active" defaultChecked={current?.active ?? true} />
        </Section>
      </EditSheet>
    </>
  );
}
