'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Search } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextArea } from '@/components/ui/fields';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { money } from '@/lib/format';
import { saveItem, setItemArchived } from '@/app/(app)/settings/products/actions';
import { EditSheet, TextField, SelectField, useEditor } from './settings-form';
import type { Row as DbRow } from '@/lib/types';

type Item = DbRow<'items'>;
type Rate = { id: string; code: string; name: string; rate: number; active: boolean };
type Cat = { id: string; name: string; archived: boolean };

const UNITS = ['each', 'hour', 'day', 'month', 'year', 'fixed', 'session', 'project', 'user'];

function validate(name: string, v: string) {
  if (name === 'name') return v.trim() ? null : 'Give it a name.';
  if (name === 'unit_price') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    return v.trim() === '' || (Number.isFinite(n) && n >= 0) ? null : 'Enter a price.';
  }
  return null;
}

export function Products({ items, rates, categories, defaultTaxCode }: { items: Item[]; rates: Rate[]; categories: Cat[]; defaultTaxCode: string }) {
  const ed = useEditor<Item>();
  const it = ed.item;
  const [q, setQ] = useState('');
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const rateById = new Map(rates.map((r) => [r.id, r]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const match = (x: Item) => !q || `${x.name} ${x.description ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const live = items.filter((x) => !x.archived && match(x));
  const archived = items.filter((x) => x.archived && match(x));
  const defaultRate = rates.find((r) => r.code === defaultTaxCode)?.id ?? '';

  async function archive(x: Item, on: boolean) {
    const r = await setItemArchived(x.id, on);
    if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
    toast({ title: on ? `${x.name} archived` : `${x.name} restored`, action: { label: 'Undo', onClick: async () => { await setItemArchived(x.id, !on); start(() => router.refresh()); } } });
    start(() => router.refresh());
  }

  const row = (x: Item) => (
    <Row
      key={x.id}
      onClick={() => ed.edit(x)}
      title={<span className={x.archived ? 'text-label-3' : ''}>{x.name}</span>}
      subtitle={x.description ?? catById.get(x.category_id ?? '')?.name}
      value={`${money(x.unit_price)}${x.unit && x.unit !== 'each' && x.unit !== 'fixed' ? ` / ${x.unit}` : ''}`}
      detail={x.tax_rate_id ? rateById.get(x.tax_rate_id)?.code : 'No tax'}
    >
      {x.archived && <Badge>Archived</Badge>}
    </Row>
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3 text-label-2 lg:h-8">
          <Search className="size-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products & services" className="min-w-0 flex-1 bg-transparent text-body text-label outline-none lg:text-subhead" type="search" />
        </label>
        <Button size="sm" variant="tinted" icon={<Plus className="size-4" />} onClick={() => ed.edit(null)}>Add</Button>
      </div>

      {live.length === 0 && archived.length === 0 ? (
        <EmptyState icon={<Package />} title={q ? 'No matches' : 'No products yet'} message={q ? 'Try a different word.' : 'Save the services you invoice often so new invoices take seconds.'} action={!q && <Button variant="filled" onClick={() => ed.edit(null)}>Add a service</Button>} />
      ) : (
        <Section footer="Pick these when adding invoice lines — the description, price and tax fill in for you.">{live.map(row)}</Section>
      )}
      {archived.length > 0 && <Section title="Archived">{archived.map(row)}</Section>}

      <EditSheet
        key={ed.key}
        open={ed.open}
        onClose={ed.close}
        title={it ? 'Edit product' : 'New product or service'}
        saveLabel={it ? 'Save' : 'Add'}
        action={saveItem}
        validate={validate}
        footer={it && (
          <Section>
            <Row title={it.archived ? 'Restore' : 'Archive'} destructive={!it.archived} onClick={() => { ed.close(); void archive(it, !it.archived); }} />
          </Section>
        )}
      >
        {it && <input type="hidden" name="id" value={it.id} />}
        {it && <input type="hidden" name="archived" value={it.archived ? 'on' : ''} />}
        <Section>
          <TextField name="name" label="Name" defaultValue={it?.name ?? ''} placeholder="Consulting" autoFocus={!it} />
          <TextArea name="description" label="Description" defaultValue={it?.description ?? ''} rows={2} maxLength={500} placeholder="Shown on the invoice line" />
        </Section>
        <Section>
          <TextField name="unit_price" label="Price" defaultValue={it ? String(Number(it.unit_price)) : ''} placeholder="0.00" inputMode="decimal" align="right" trailing="CAD" />
          <SelectField name="unit" label="Per" defaultValue={it?.unit ?? 'each'} options={[...new Set([...(it?.unit ? [it.unit] : []), ...UNITS])].map((u) => ({ value: u, label: u }))} />
        </Section>
        <Section footer="Tax rate and income category fill in on new invoice lines; you can still change them per line.">
          <SelectField
            name="tax_rate_id"
            label="Tax"
            defaultValue={it ? it.tax_rate_id ?? '' : defaultRate}
            placeholder="No tax"
            options={rates.filter((r) => r.active || r.id === it?.tax_rate_id).map((r) => ({ value: r.id, label: `${r.code} · ${(Number(r.rate) * 100).toFixed(Number(r.rate) * 100 % 1 ? 2 : 0)}%` }))}
          />
          <SelectField
            name="category_id"
            label="Income category"
            defaultValue={it?.category_id ?? categories[0]?.id ?? ''}
            placeholder="None"
            options={categories.filter((c) => !c.archived || c.id === it?.category_id).map((c) => ({ value: c.id, label: c.name }))}
          />
        </Section>
      </EditSheet>
    </>
  );
}
