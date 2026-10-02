'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, BookOpen, Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Segmented } from '@/components/ui/segmented';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { saveCategory, setCategoryArchived, reorderCategories } from '@/app/(app)/settings/categories/actions';
import { CATEGORY_ICONS, CategoryTile, categoryColor } from './category-icons';
import { EditSheet, TextField, SelectField, useEditor } from './settings-form';
import { Swatches } from './swatches';
import { CCA_CLASSES, GIFI_HINTS } from './validate';
import type { Row as DbRow } from '@/lib/types';

type Category = DbRow<'categories'>;
type Kind = 'expense' | 'income';

function validate(name: string, v: string) {
  if (name === 'name') return v.trim() ? null : 'Give the category a name.';
  if (name === 'gifi_code') return !v.trim() || /^\d{4}$/.test(v.trim()) ? null : '4 digits, e.g. 8810.';
  if (name === 'deductible_pct') {
    const n = Number(v.replace('%', ''));
    return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? null : 'Between 0 and 100.';
  }
  return null;
}

export function Categories({ categories, initialKind }: { categories: Category[]; initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [capital, setCapital] = useState(false);
  const [gifiOpen, setGifiOpen] = useState(false);
  const ed = useEditor<Category>();
  const c = ed.item;
  const [saving, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const live = categories.filter((x) => x.kind === kind && !x.archived);
  const byId = new Map(categories.map((x) => [x.id, x]));
  const shown = order ? order.map((id) => byId.get(id)!).filter(Boolean) : live;
  const archived = categories.filter((x) => x.kind === kind && x.archived);
  const counts = { expense: categories.filter((x) => x.kind === 'expense' && !x.archived).length, income: categories.filter((x) => x.kind === 'income' && !x.archived).length };

  function edit(x: Category | null) {
    setCapital(x?.is_capital ?? false);
    ed.edit(x);
  }

  function move(i: number, dir: -1 | 1) {
    const ids = (order ?? live.map((x) => x.id)).slice();
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setOrder(ids);
  }

  function finishReorder() {
    if (!order) { setReordering(false); return; }
    start(async () => {
      const r = await reorderCategories(order);
      if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
      toast({ title: 'Order saved' });
      setReordering(false);
      setOrder(null);
      router.refresh();
    });
  }

  async function archive(x: Category, on: boolean) {
    const r = await setCategoryArchived(x.id, on);
    if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
    toast({ title: on ? `${x.name} archived` : `${x.name} restored`, action: { label: 'Undo', onClick: async () => { await setCategoryArchived(x.id, !on); start(() => router.refresh()); } } });
    start(() => router.refresh());
  }

  const editKind: Kind = (c?.kind as Kind) ?? kind;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={kind}
          onChange={(k) => { setKind(k); setReordering(false); setOrder(null); }}
          options={[{ value: 'expense', label: 'Expenses', count: counts.expense }, { value: 'income', label: 'Income', count: counts.income }]}
        />
        <span className="flex-1" />
        {reordering ? (
          <>
            <Button size="sm" variant="plain" onClick={() => { setReordering(false); setOrder(null); }}>Cancel</Button>
            <Button size="sm" variant="filled" loading={saving} onClick={finishReorder}>Done</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="gray" onClick={() => setReordering(true)}>Reorder</Button>
            <Button size="sm" variant="tinted" icon={<Plus className="size-4" />} onClick={() => edit(null)}>Add</Button>
          </>
        )}
      </div>

      <Section
        inset={58}
        footer={reordering ? 'Move categories up or down — this is the order they appear in pickers.' : kind === 'expense' ? 'Deductible % applies to the business portion (meals & entertainment are 50%). Capital purchases go to CCA instead of being expensed.' : 'Income categories group revenue on reports and the T2.'}
      >
        {shown.map((x, i) => (
          <Row
            key={x.id}
            onClick={reordering ? undefined : () => edit(x)}
            icon={<CategoryTile icon={x.icon} color={x.color} />}
            title={x.name}
            subtitle={[x.gifi_code && `GIFI ${x.gifi_code}`, x.kind === 'expense' && Number(x.deductible_pct) !== 100 && `${Number(x.deductible_pct)}% deductible`, x.is_capital && `CCA class ${x.cca_class}`].filter(Boolean).join(' · ') || undefined}
          >
            {reordering ? (
              <span className="flex gap-1">
                <button type="button" aria-label={`Move ${x.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="pressable flex size-9 items-center justify-center rounded-full bg-fill text-label-2 disabled:opacity-30 lg:size-7"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label={`Move ${x.name} down`} disabled={i === shown.length - 1} onClick={() => move(i, 1)} className="pressable flex size-9 items-center justify-center rounded-full bg-fill text-label-2 disabled:opacity-30 lg:size-7"><ArrowDown className="size-4" /></button>
              </span>
            ) : x.is_capital ? <Badge tone="blue">Capital</Badge> : null}
          </Row>
        ))}
      </Section>

      {archived.length > 0 && !reordering && (
        <Section title="Archived" inset={58} footer="Archived categories stay on past records but can’t be picked for new ones.">
          {archived.map((x) => (
            <Row key={x.id} onClick={() => edit(x)} icon={<span className="opacity-50"><CategoryTile icon={x.icon} color={x.color} /></span>} title={<span className="text-label-3">{x.name}</span>} subtitle={x.gifi_code ? `GIFI ${x.gifi_code}` : undefined} />
          ))}
        </Section>
      )}

      <Section title="GIFI reference" inset={58}>
        <Row icon={<span className="flex size-[30px] items-center justify-center text-label-2"><BookOpen className="size-5" /></span>} title="Common GIFI codes" subtitle="The line each category lands on in your T2 financial statements" onClick={() => setGifiOpen((o) => !o)} value={gifiOpen ? 'Hide' : 'Show'} />
        {gifiOpen && <GifiTable />}
      </Section>

      <EditSheet
        key={ed.key}
        open={ed.open}
        onClose={ed.close}
        title={c ? 'Edit category' : `New ${kind} category`}
        saveLabel={c ? 'Save' : 'Add'}
        action={saveCategory}
        validate={validate}
        footer={c && (
          <Section>
            <Row title={c.archived ? 'Restore category' : 'Archive category'} destructive={!c.archived} onClick={() => { ed.close(); void archive(c, !c.archived); }} />
          </Section>
        )}
      >
        {c && <input type="hidden" name="id" value={c.id} />}
        <input type="hidden" name="kind" value={editKind} />
        <Section>
          <TextField name="name" label="Name" defaultValue={c?.name ?? ''} placeholder={editKind === 'expense' ? 'Office supplies' : 'Project revenue'} autoFocus={!c} />
          <TextField name="gifi_code" label="GIFI code" defaultValue={c?.gifi_code ?? ''} inputMode="numeric" maxLength={4} placeholder="8810" list="gifi-codes" hint="Optional. Your accountant can confirm the right line." />
          {editKind === 'expense' && (
            <TextField name="deductible_pct" label="Deductible" defaultValue={String(Number(c?.deductible_pct ?? 100))} inputMode="decimal" align="right" trailing="%" />
          )}
        </Section>
        <datalist id="gifi-codes">
          {GIFI_HINTS.filter((g) => (editKind === 'income' ? g.kind === 'income' : g.kind !== 'income')).map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
        </datalist>
        {editKind === 'expense' && (
          <Section footer="Capital purchases (computers, furniture) are depreciated through capital cost allowance instead of expensed in one year.">
            <Toggle name="is_capital" label="Capital purchase" checked={capital} onChange={setCapital} />
            {capital && <SelectField name="cca_class" label="CCA class" defaultValue={c?.cca_class ?? '50'} options={CCA_CLASSES} />}
          </Section>
        )}
        <Section title="Icon">
          <IconPicker defaultValue={c?.icon ?? 'tag'} color={c?.color ?? null} />
        </Section>
        <Section>
          <Swatches name="color" defaultValue={c?.color ?? ''} label="Colour" allowNone />
        </Section>
      </EditSheet>
    </>
  );
}

function IconPicker({ defaultValue, color }: { defaultValue: string; color: string | null }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="grid grid-cols-6 gap-2 p-3 sm:grid-cols-8" role="radiogroup" aria-label="Icon">
      <input type="hidden" name="icon" value={value} />
      {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          title={name}
          onClick={() => setValue(name)}
          className={cn('pressable flex aspect-square items-center justify-center rounded-[10px] transition-colors', value === name ? 'text-white' : 'bg-fill-2 text-label-2 hover:bg-fill')}
          style={value === name ? { background: categoryColor(name, color) } : undefined}
        >
          <Icon className="size-5" strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}

function GifiTable() {
  return (
    <div className="px-4 pb-3 lg:px-3">
      {(['income', 'expense', 'asset'] as const).map((k) => (
        <div key={k} className="mt-2">
          <div className="text-caption font-semibold uppercase tracking-wide text-label-3">{k === 'asset' ? 'Capital assets' : k === 'income' ? 'Revenue' : 'Expenses'}</div>
          <dl className="mt-1 grid grid-cols-[3.5rem_1fr] gap-y-0.5 text-footnote">
            {GIFI_HINTS.filter((g) => g.kind === k).map((g) => (
              <div key={g.code} className="contents">
                <dt className="tabular font-medium">{g.code}</dt>
                <dd className="text-label-2">{g.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="mt-2 text-caption text-label-3">From CRA’s GIFI guide (RC4088). Confirm codes with your accountant at year-end.</p>
    </div>
  );
}
