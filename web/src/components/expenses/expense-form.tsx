'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle, Camera, ChevronRight, CreditCard, Landmark, Paperclip, Wallet, X, FileText, Lock, Info,
} from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Input, Select, TextArea, Toggle, AmountInput, Chips } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { uploadAttachment } from '@/components/files/attachments';
import { useDebounced, haptic } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { CategoryTile } from './category-icon';
import { CategorySheet } from './category-sheet';
import { backCalc, consequence, treatment, TAX_PRESETS, type Nature, type TaxPreset, round2 } from './math';
import type { FormOptions, FxQuote, VendorMemory } from './server';
import { createExpense, updateExpense, getFxRate, findDuplicates, type DuplicateHit, type ExpenseInput } from '@/app/(app)/expenses/actions';

export type ExpenseFormValues = {
  spent_on: string; vendor: string; description: string; category_id: string | null; project_id: string | null;
  spent_by: string; paid_from_account_id: string; nature: Nature; business_pct: number; currency: 'CAD' | 'USD';
  total: number; gst_hst: number; pst: number; fx_rate: number | null; billable: boolean; tags: string[]; notes: string;
};

type Props = {
  options: FormOptions;
  meId: string;
  today: string;
  lockBefore: string | null;
  mode: 'create' | 'edit';
  expenseId?: string;
  initial?: Partial<ExpenseFormValues>;
  /** Open the camera picker as soon as the form mounts (?scan=1). */
  scan?: boolean;
  duplicatedFrom?: string | null;
};

/** Wrapper that remounts the form after "Save & add another". */
export function ExpenseForm(props: Props) {
  const [round, setRound] = useState(0);
  const [carry, setCarry] = useState<Partial<ExpenseFormValues> | null>(null);
  return (
    <ExpenseFormInner
      key={round}
      {...props}
      initial={carry ?? props.initial}
      scan={round === 0 ? props.scan : false}
      duplicatedFrom={round === 0 ? props.duplicatedFrom : null}
      onAnother={(keep) => { setCarry(keep); setRound((r) => r + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
    />
  );
}

function ExpenseFormInner({ options, meId, today, lockBefore, mode, expenseId, initial, scan, duplicatedFrom, onAnother }: Props & { onAnother: (keep: Partial<ExpenseFormValues>) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<null | 'save' | 'another'>(null);
  const [error, setError] = useState<string | null>(null);

  const spender0 = initial?.spent_by ?? meId;
  const [v, setV] = useState<ExpenseFormValues>(() => ({
    spent_on: initial?.spent_on ?? today,
    vendor: initial?.vendor ?? '',
    description: initial?.description ?? '',
    category_id: initial?.category_id ?? null,
    project_id: initial?.project_id ?? null,
    spent_by: spender0,
    paid_from_account_id: initial?.paid_from_account_id ?? options.usualAccount[spender0] ?? options.accounts.find((a) => a.is_business)?.id ?? options.accounts[0]!.id,
    nature: initial?.nature ?? 'business',
    business_pct: initial?.business_pct ?? 100,
    currency: initial?.currency ?? 'CAD',
    total: initial?.total ?? 0,
    gst_hst: initial?.gst_hst ?? 0,
    pst: initial?.pst ?? 0,
    fx_rate: initial?.fx_rate ?? null,
    billable: initial?.billable ?? false,
    tags: initial?.tags ?? [],
    notes: initial?.notes ?? '',
  }));
  const set = (patch: Partial<ExpenseFormValues>) => setV((s) => ({ ...s, ...patch }));

  // Taxes: strings while typing, preset drives the back-calculation.
  const [preset, setPreset] = useState<TaxPreset>(() => {
    if (initial?.total) {
      const guess = (['none', 'gst', 'hst13', 'bc'] as const).find((p) => {
        const b = backCalc(initial.total!, p)!;
        return Math.abs(b.gstHst - (initial.gst_hst ?? 0)) <= 0.02 && Math.abs(b.pst - (initial.pst ?? 0)) <= 0.02;
      });
      return guess ?? 'custom';
    }
    return (initial?.currency ?? 'CAD') === 'USD' ? 'none' : 'gst';
  });
  const [gstText, setGstText] = useState(initial?.gst_hst ? String(initial.gst_hst) : '');
  const [pstText, setPstText] = useState(initial?.pst ? String(initial.pst) : '');
  const applyTax = (total: number, p: TaxPreset) => {
    const b = backCalc(total, p);
    if (!b) return;
    setGstText(b.gstHst ? b.gstHst.toFixed(2) : '');
    setPstText(b.pst ? b.pst.toFixed(2) : '');
    set({ gst_hst: b.gstHst, pst: b.pst });
  };

  // ── Exchange rate (Bank of Canada) ──
  const fxKey = `${v.currency}:${v.spent_on}`;
  const initialFxKey = initial?.currency && initial.currency !== 'CAD' && initial.fx_rate ? `${initial.currency}:${initial.spent_on}` : null;
  const [fxState, setFxState] = useState<{ key: string; quote: FxQuote | null; error?: string } | null>(
    initialFxKey ? { key: initialFxKey, quote: { rate: initial!.fx_rate!, rateDate: initial!.spent_on!, source: 'stored' } } : null,
  );
  useEffect(() => {
    if (v.currency === 'CAD' || fxState?.key === fxKey) return;
    let alive = true;
    getFxRate(v.currency, v.spent_on).then((r) => {
      if (alive) setFxState({ key: fxKey, quote: r.ok ? r.data! : null, error: r.ok ? undefined : r.error });
    });
    return () => { alive = false; };
  }, [fxKey, v.currency, v.spent_on, fxState?.key]);
  const fx = v.currency === 'CAD' ? { rate: 1, rateDate: v.spent_on, source: 'stored' as const } : fxState?.key === fxKey ? fxState.quote : null;
  const fxLoading = v.currency !== 'CAD' && fxState?.key !== fxKey;

  // ── Duplicate warning ──
  const dupKey = useDebounced(`${v.vendor.trim().toLowerCase()}|${v.total}|${v.spent_on}`, 500);
  const [dupes, setDupes] = useState<{ key: string; hits: DuplicateHit[] }>({ key: '', hits: [] });
  useEffect(() => {
    const [vendor, total, date] = dupKey.split('|');
    if (!vendor || !(Number(total) > 0)) return;
    let alive = true;
    findDuplicates(vendor, Number(total), date!, expenseId).then((r) => { if (alive && r.ok) setDupes({ key: dupKey, hits: r.data! }); });
    return () => { alive = false; };
  }, [dupKey, expenseId]);
  const duplicateHits = dupes.key === dupKey && v.vendor.trim() && v.total > 0 ? dupes.hits : [];

  // ── Derived ──
  const category = options.categories.find((c) => c.id === v.category_id) ?? null;
  const account = options.accounts.find((a) => a.id === v.paid_from_account_id)!;
  const spender = options.members.find((m) => m.id === v.spent_by)!;
  const t = treatment({
    total: v.total, fxRate: fx?.rate ?? 1, gstHst: v.gst_hst, nature: v.nature, businessPct: v.business_pct,
    categoryDeductiblePct: category?.deductible_pct ?? 100, paidWithBusinessFunds: !!account?.is_business,
  });
  const line = consequence(t, { memberFirst: spender?.full_name.split(' ')[0] ?? 'the owner', isCapital: !!category?.is_capital, ccaClass: category?.cca_class });
  const locked = !!lockBefore && v.spent_on < lockBefore;
  const accountChoices = options.accounts.filter((a) => a.kind !== 'personal' || a.owner_member_id === v.spent_by);

  // ── Vendor autocomplete ──
  const [vendorFocus, setVendorFocus] = useState(false);
  const suggestions = useMemo(() => {
    const q = v.vendor.trim().toLowerCase();
    if (!q) return [];
    const starts = options.vendors.filter((x) => x.vendor.toLowerCase().startsWith(q));
    const contains = options.vendors.filter((x) => !x.vendor.toLowerCase().startsWith(q) && x.vendor.toLowerCase().includes(q));
    return [...starts, ...contains].filter((x) => x.vendor.toLowerCase() !== q).slice(0, 6);
  }, [v.vendor, options.vendors]);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  function pickVendor(m: VendorMemory) {
    const acct = options.accounts.find((a) => a.id === m.paid_from_account_id);
    const acctOk = acct && (acct.kind !== 'personal' || acct.owner_member_id === v.spent_by);
    const patch: Partial<ExpenseFormValues> = {
      vendor: m.vendor, category_id: m.category_id, nature: m.nature, business_pct: m.nature === 'mixed' ? m.business_pct : m.nature === 'business' ? 100 : 0,
      project_id: m.project_id, currency: m.currency === 'USD' ? 'USD' : 'CAD',
    };
    if (acctOk) patch.paid_from_account_id = m.paid_from_account_id;
    if (!v.description && m.description && m.tags.includes('subscription')) patch.description = m.description;
    set(patch);
    setPreset(m.taxPreset);
    applyTax(v.total, m.taxPreset);
    setVendorFocus(false);
    setPrefilled(m.vendor);
    haptic();
  }

  // ── Category sheet ──
  const [catOpen, setCatOpen] = useState(false);

  // ── Receipts staged until the expense exists ──
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ file: File; url: string | null }[]>([]);
  useEffect(() => {
    if (scan) camera.current?.click();
  }, [scan]);
  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }));
    setFiles((xs) => [...xs, ...next]);
    if (camera.current) camera.current.value = '';
    if (picker.current) picker.current.value = '';
  }
  function removeFile(i: number) {
    setFiles((xs) => { const f = xs[i]; if (f?.url) URL.revokeObjectURL(f.url); return xs.filter((_, j) => j !== i); });
  }

  // ── Tags ──
  const [tagDraft, setTagDraft] = useState('');
  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (tag && !v.tags.includes(tag)) set({ tags: [...v.tags, tag] });
    setTagDraft('');
  };

  // ── Save ──
  async function save(another: boolean) {
    setError(null);
    if (locked) return setError(`The books are closed before ${format(parseISO(lockBefore!), 'MMM d, yyyy')}.`);
    if (!v.vendor.trim()) return setError('Add who you paid.');
    if (!(v.total > 0)) return setError('Enter the amount you paid.');
    if (v.currency !== 'CAD' && !fx) return setError('Still fetching the exchange rate — try again in a moment.');
    const input: ExpenseInput = {
      ...v, description: v.description || null, notes: v.notes || null, fx_rate: v.currency === 'CAD' ? 1 : fx!.rate,
      tags: tagDraft.trim() ? [...v.tags, tagDraft.trim().toLowerCase()] : v.tags,
      source: mode === 'create' && files.length && scan ? 'receipt_scan' : 'manual',
    };
    setSaving(another ? 'another' : 'save');
    const r = mode === 'edit' && expenseId ? await updateExpense(expenseId, input) : await createExpense(input);
    if (!r.ok) { setSaving(null); setError(r.error); toast({ title: r.error, tone: 'error' }); return; }
    const id = r.data!.id;
    let uploadFailed = false;
    for (const f of files) {
      try { await uploadAttachment(f.file, 'expense', id); } catch { uploadFailed = true; }
    }
    files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    haptic([6, 30, 6]);
    toast({
      title: uploadFailed ? 'Saved — a receipt didn’t upload. Add it from the expense.' : mode === 'edit' ? 'Changes saved' : `${v.vendor.trim()} · ${money(t.totalCad)} saved`,
      tone: uploadFailed ? 'error' : 'success',
    });
    if (another) {
      setSaving(null);
      onAnother({ spent_on: v.spent_on, spent_by: v.spent_by, paid_from_account_id: v.paid_from_account_id, currency: v.currency });
      startTransition(() => router.refresh());
      return;
    }
    startTransition(() => {
      router.push(`/expenses/${id}`);
      router.refresh();
    });
  }

  // ⌘S saves
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const busy = !!saving || pending;
  const subtotal = round2(v.total - v.gst_hst - v.pst);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(false); }}
      className="mx-auto max-w-[640px] pb-28 lg:pb-24"
    >
      {duplicatedFrom && (
        <p className="mb-3 flex items-center gap-2 rounded-[12px] bg-blue-soft px-3 py-2 text-footnote text-blue">
          <Info className="size-4 shrink-0" /> Copied from {duplicatedFrom}. Check the date and amount.
        </p>
      )}

      {/* Amount */}
      <Section>
        <AmountInput name="total" currency={v.currency} defaultValue={initial?.total ? initial.total.toFixed(2) : ''} autoFocus={mode === 'create' && !scan} onValue={(n) => { set({ total: n }); if (preset !== 'custom') applyTax(n, preset); }} />
        <div className="flex flex-col items-center gap-2 px-4 pb-4">
          <Segmented
            options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]}
            value={v.currency}
            onChange={(c) => {
              set({ currency: c as 'CAD' | 'USD' });
              if (c === 'USD' && preset === 'gst') { setPreset('none'); applyTax(v.total, 'none'); }
            }}
          />
          {v.currency !== 'CAD' && (
            <p className="tabular text-center text-footnote text-label-2">
              {fxLoading ? 'Getting the Bank of Canada rate…' : fx ? (
                <>≈ <span className="font-semibold text-label">{money(t.totalCad)}</span> CAD · BoC {fx.rate.toFixed(4)}
                  {fx.rateDate !== v.spent_on ? ` (${format(parseISO(fx.rateDate), 'MMM d')})` : ''}
                  {fx.source === 'fallback' ? ' · estimated, rate unavailable' : ''}</>
              ) : <span className="text-red">{fxState?.error ?? 'Rate unavailable'}</span>}
            </p>
          )}
        </div>
      </Section>

      {/* Receipt (create only — on an existing expense the gallery handles it) */}
      {mode === 'create' && (
        <Section title="Receipt" footer={files.length ? 'Uploaded after the expense is saved. Photos are compressed to WebP.' : 'CRA expects a receipt for every business expense.'}>
          <div className="flex flex-wrap gap-2.5 p-3">
            {files.map((f, i) => (
              <div key={i} className="relative size-[84px] overflow-hidden rounded-[12px] bg-inset shadow-[inset_0_0_0_0.5px_var(--separator-strong)] lg:size-[76px]">
                {f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.file.name} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 text-label-2"><FileText className="size-7" strokeWidth={1.5} /><span className="max-w-[90%] truncate text-caption2">{f.file.name}</span></span>
                )}
                <button type="button" onClick={() => removeFile(i)} aria-label="Remove file" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white"><X className="size-3.5" /></button>
              </div>
            ))}
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
            <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <button type="button" onClick={() => camera.current?.click()} className="pressable flex size-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-separator-strong text-accent-text lg:hidden">
              <Camera className="size-6" /><span className="text-caption font-medium">Take photo</span>
            </button>
            <button type="button" onClick={() => picker.current?.click()} className="pressable flex size-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-separator-strong text-accent-text lg:size-[76px]">
              <Paperclip className="size-6" /><span className="text-caption font-medium">Add file</span>
            </button>
          </div>
        </Section>
      )}

      {/* Vendor, description, date, category */}
      <Section>
        <div className="relative">
          <Input
            label="Vendor"
            name="vendor"
            placeholder="Who did you pay?"
            autoComplete="off"
            align="right"
            value={v.vendor}
            onChange={(e) => { set({ vendor: e.target.value }); setVendorFocus(true); setPrefilled(null); }}
            onFocus={() => setVendorFocus(true)}
            onBlur={() => setTimeout(() => setVendorFocus(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && vendorFocus && suggestions[0]) { e.preventDefault(); pickVendor(suggestions[0]); } }}
          />
          {vendorFocus && suggestions.length > 0 && (
            <div className="material-thick absolute inset-x-2 top-[calc(100%-4px)] z-30 overflow-hidden rounded-[12px] py-1 shadow-pop" role="listbox">
              {suggestions.map((s) => {
                const cat = options.categories.find((c) => c.id === s.category_id);
                return (
                  <button key={s.vendor} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pickVendor(s)} className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-fill-2 active:bg-fill">
                    <CategoryTile icon={cat?.icon} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{s.vendor}</span>
                      <span className="block truncate text-footnote text-label-2">{cat?.name ?? 'No category'}{s.nature !== 'business' ? ` · ${s.nature === 'mixed' ? `${s.business_pct}% business` : 'Personal'}` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Input label="What for" name="description" placeholder="Optional" align="right" value={v.description} onChange={(e) => set({ description: e.target.value })} />
        <Input label="Date" name="spent_on" type="date" align="right" value={v.spent_on} max="2100-12-31" onChange={(e) => e.target.value && set({ spent_on: e.target.value })} error={locked ? `Books are closed before ${format(parseISO(lockBefore!), 'MMM d, yyyy')}` : null} />
        <button type="button" onClick={() => setCatOpen(true)} className="row-press flex min-h-[var(--row-h)] w-full items-center gap-3 px-4 text-left lg:px-3">
          <span className="w-[34%] max-w-[160px] shrink-0 text-label lg:w-[140px]">Category</span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {category ? <><CategoryTile icon={category.icon} size={24} /><span className="truncate text-label-2">{category.name}</span></> : <span className="text-label-3">Choose</span>}
          </span>
          <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
        </button>
      </Section>
      {prefilled && <p className="-mt-5 mb-6 px-4 text-footnote text-label-2 lg:px-1">Filled in from your last {prefilled} expense.</p>}

      {/* Who & how */}
      <Section title="Who spent">
        <div className="p-3">
          <Segmented
            full
            options={options.members.map((m) => ({ value: m.id, label: <span className="flex items-center gap-1.5"><Avatar name={m.full_name} color={m.color} initials={m.initials} size={18} />{m.full_name.split(' ')[0]}</span> }))}
            value={v.spent_by}
            onChange={(id) => {
              const acct = options.accounts.find((a) => a.id === v.paid_from_account_id);
              const patch: Partial<ExpenseFormValues> = { spent_by: id };
              if (acct?.kind === 'personal') patch.paid_from_account_id = options.accounts.find((a) => a.kind === 'personal' && a.owner_member_id === id)?.id ?? options.usualAccount[id] ?? acct.id;
              set(patch);
            }}
          />
        </div>
      </Section>

      <Section title="Paid with">
        <div className="p-3">
          <Chips
            options={accountChoices.map((a) => ({
              value: a.id,
              label: a.kind === 'personal' ? `${a.name.split(' ')[0]} — personal` : a.name,
              icon: a.kind === 'credit_card' ? <CreditCard className="size-4" /> : a.kind === 'personal' ? <Wallet className="size-4" /> : <Landmark className="size-4" />,
            }))}
            value={v.paid_from_account_id}
            onChange={(id) => set({ paid_from_account_id: id })}
          />
        </div>
      </Section>

      {/* Nature */}
      <Section title="What was it for">
        <div className="p-3">
          <Segmented
            full
            options={[{ value: 'business', label: 'Business' }, { value: 'personal', label: 'Personal' }, { value: 'mixed', label: 'Mixed' }]}
            value={v.nature}
            onChange={(n) => set({ nature: n as Nature, business_pct: n === 'mixed' ? (v.business_pct > 0 && v.business_pct < 100 ? v.business_pct : 50) : n === 'business' ? 100 : 0 })}
          />
          {v.nature === 'mixed' && (
            <div className="mt-4 px-1">
              <div className="flex items-baseline justify-between">
                <span className="text-subhead text-label-2">Business share</span>
                <span className="tabular text-title3 font-semibold">{v.business_pct}%</span>
              </div>
              <input
                type="range" min={1} max={99} step={1} value={v.business_pct}
                onChange={(e) => set({ business_pct: Number(e.target.value) })}
                aria-label="Business percentage"
                className="mt-2 h-8 w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
              <div className="mt-1 flex gap-1.5">
                {[25, 40, 50, 60, 75].map((p) => (
                  <button key={p} type="button" onClick={() => set({ business_pct: p })} className={cn('pressable h-8 flex-1 rounded-full text-footnote font-medium', v.business_pct === p ? 'bg-label text-bg' : 'bg-fill text-label')}>{p}%</button>
                ))}
              </div>
            </div>
          )}
          <p
            className={cn('mt-3 rounded-[12px] px-3 py-2.5 text-subhead font-medium',
              t.businessPct === 0 ? 'bg-purple-soft text-purple' : t.owed < 0 ? 'bg-orange-soft text-orange' : 'bg-accent-soft text-accent-text')}
            aria-live="polite"
          >
            {line}
          </p>
        </div>
      </Section>

      {/* Taxes */}
      <Section title="Sales tax" footer={v.total > 0 ? <>Subtotal {money(subtotal, v.currency)} · GST/HST is claimed back as an ITC; PST isn’t recoverable.</> : 'Pick what the receipt shows — amounts are worked back from the total.'}>
        <div className="p-3 pb-1">
          <Chips
            options={TAX_PRESETS.filter((p) => p.value !== 'custom' || preset === 'custom').map((p) => ({ value: p.value, label: p.label }))}
            value={preset}
            onChange={(p) => { setPreset(p); applyTax(v.total, p); }}
          />
        </div>
        <Input
          label="GST/HST" name="gst_hst" inputMode="decimal" align="right" placeholder="0.00" value={gstText}
          trailing={v.currency === 'USD' ? 'US$' : '$'}
          onChange={(e) => { const s = e.target.value.replace(/[^\d.]/g, ''); setGstText(s); set({ gst_hst: Number(s || 0) }); setPreset('custom'); }}
        />
        <Input
          label="PST" name="pst" inputMode="decimal" align="right" placeholder="0.00" value={pstText}
          trailing={v.currency === 'USD' ? 'US$' : '$'}
          onChange={(e) => { const s = e.target.value.replace(/[^\d.]/g, ''); setPstText(s); set({ pst: Number(s || 0) }); setPreset('custom'); }}
        />
      </Section>

      {/* Extras */}
      <Section>
        <Select
          label="Project" name="project_id" value={v.project_id ?? ''} placeholder="None"
          options={options.projects.map((p) => ({ value: p.id, label: p.name, group: p.status === 'done' ? 'Finished' : 'Current' }))}
          onChange={(e) => set({ project_id: e.target.value || null })}
        />
        <Toggle label="Billable to client" hint={v.billable ? 'Shows up when you invoice this project.' : undefined} checked={v.billable} onChange={(b) => set({ billable: b })} />
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
          {v.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => set({ tags: v.tags.filter((x) => x !== tag) })} className="pressable inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1.5 text-footnote font-medium text-accent-text">
              #{tag}<X className="size-3.5" />
            </button>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); } }}
            onBlur={() => tagDraft && addTag(tagDraft)}
            placeholder={v.tags.length ? 'Add tag' : 'Add a tag, e.g. asset'}
            className="h-8 min-w-[8rem] flex-1 bg-transparent outline-none"
            aria-label="Add tag"
          />
        </div>
        {options.tags.filter((x) => !v.tags.includes(x)).length > 0 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-3">
            {options.tags.filter((x) => !v.tags.includes(x)).map((x) => (
              <button key={x} type="button" onClick={() => addTag(x)} className="pressable h-7 shrink-0 rounded-full bg-fill px-2.5 text-footnote text-label-2">#{x}</button>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <TextArea label="Notes" name="notes" rows={2} placeholder="Anything your accountant should know" value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Section>

      {duplicateHits.length > 0 && (
        <div className="mb-6 flex gap-2.5 rounded-group bg-orange-soft p-3 text-subhead text-orange">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Possible duplicate</p>
            {duplicateHits.map((d) => (
              <Link key={d.id} href={`/expenses/${d.id}`} target="_blank" className="block truncate underline-offset-2 hover:underline">
                {d.vendor} · {money(d.total, d.currency)} on {format(parseISO(d.spent_on), 'MMM d')}{d.spent_by_name ? ` by ${d.spent_by_name.split(' ')[0]}` : ''}
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mb-4 rounded-[12px] bg-red-soft px-3 py-2.5 text-subhead text-red" role="alert">{error}</p>}

      {/* Sticky action bar (sits above the floating tab bar on phones) */}
      <div className="fixed inset-x-0 z-30 flex justify-center px-4 bottom-[calc(var(--tabbar-h)+max(var(--safe-bottom),10px)+10px)] lg:sticky lg:bottom-4 lg:px-0">
        <div className="material-glass flex w-full max-w-[640px] gap-2 rounded-[20px] p-2 shadow-pop">
          {locked ? (
            <p className="flex h-[50px] flex-1 items-center justify-center gap-2 text-subhead text-label-2 lg:h-10"><Lock className="size-4" /> Closed period — can’t save</p>
          ) : mode === 'edit' ? (
            <>
              <Button type="button" size="lg" variant="gray" className="flex-1" href={`/expenses/${expenseId}`}>Cancel</Button>
              <Button type="submit" size="lg" variant="filled" className="flex-[2]" loading={saving === 'save'} disabled={busy}>Save changes</Button>
            </>
          ) : (
            <>
              <Button type="button" size="lg" variant="tinted" className="flex-1" loading={saving === 'another'} disabled={busy} onClick={() => save(true)}>Save &amp; add another</Button>
              <Button type="submit" size="lg" variant="filled" className="flex-1" loading={saving === 'save'} disabled={busy}>Save</Button>
            </>
          )}
        </div>
      </div>

      <CategorySheet open={catOpen} onClose={() => setCatOpen(false)} categories={options.categories} recent={options.recentCategories} value={v.category_id} onChange={(id) => set({ category_id: id })} />
    </form>
  );
}
