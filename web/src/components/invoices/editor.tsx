'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, ChevronUp, Lock, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section } from '@/components/ui/group';
import { Input, Select, TextArea, Chips } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { date, money } from '@/lib/format';
import { ClientTile } from './client-tile';
import { computeTotals, KIND_LABEL, newKey, treatmentLabel, type TaxRate } from './shared';
import { saveInvoice, type InvoiceInput } from '@/app/(app)/invoices/actions';

export type EditorClient = { id: string; display_name: string; company_name: string | null; province: string | null; country: string; currency: string; terms_days: number | null; default_tax_rate_id: string | null; email: string | null; archived: boolean };
export type EditorData = {
  clients: EditorClient[];
  projects: { id: string; name: string; client_id: string | null; status: string }[];
  items: { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate_id: string | null }[];
  rates: (TaxRate & { active: boolean })[];
  defaults: { termsDays: number; estimateValidDays: number; lockBefore: string | null; today: string; gstNumber: string | null };
};
export type EditorLine = { key: string; item_id: string | null; description: string; detail: string; quantity: string; unit: string; unit_price: string; tax_rate_id: string | null };
export type EditorInitial = {
  id?: string;
  kind: 'invoice' | 'estimate' | 'credit_note';
  number?: string;
  status?: string;
  revision?: number;
  client_id: string | null;
  project_id: string | null;
  title: string;
  po_number: string;
  issue_date: string;
  due_date: string | null;
  discount: string;
  notes: string;
  terms: string;
  lines: EditorLine[];
  converted_from?: string | null;
  recurring_id?: string | null;
  source_label?: string | null;
  bill_expense_ids?: string[];
};

const blankLine = (tax: string | null): EditorLine => ({ key: newKey(), item_id: null, description: '', detail: '', quantity: '1', unit: '', unit_price: '', tax_rate_id: tax });
const parseNum = (s: string) => {
  const v = Number(String(s).replace(/[,\s$]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

type Preset = 'receipt' | '7' | '15' | '30' | '60' | 'custom';

function presetFor(issue: string, due: string | null, kind: EditorInitial['kind']): Preset {
  if (!due) return 'custom';
  const d = differenceInCalendarDays(parseISO(due), parseISO(issue));
  if (d === 0 && kind === 'invoice') return 'receipt';
  const opts = kind === 'estimate' ? [15, 30, 60] : [7, 15, 30];
  return opts.includes(d) ? (String(d) as Preset) : 'custom';
}

export function InvoiceEditor({ data, initial, backHref }: { data: EditorData; initial: EditorInitial; backHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const kind = initial.kind;
  const issued = !!initial.id && !!initial.status && initial.status !== 'draft';
  const label = KIND_LABEL[kind];

  const [clientId, setClientId] = useState<string | null>(initial.client_id);
  const [projectId, setProjectId] = useState<string | null>(initial.project_id);
  const [title, setTitle] = useState(initial.title);
  const [po, setPo] = useState(initial.po_number);
  const [issue, setIssue] = useState(initial.issue_date);
  const [due, setDue] = useState<string | null>(initial.due_date);
  const [preset, setPreset] = useState<Preset>(presetFor(initial.issue_date, initial.due_date, kind));
  const [discount, setDiscount] = useState(initial.discount);
  const [notes, setNotes] = useState(initial.notes);
  const [terms, setTerms] = useState(initial.terms);
  const [lines, setLines] = useState<EditorLine[]>(initial.lines.length ? initial.lines : [blankLine(null)]);
  const [picker, setPicker] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const touch = () => { dirty.current = true; };

  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const ratesById = useMemo(() => new Map(data.rates.map((r) => [r.id, r])), [data.rates]);
  const clientRate = client?.default_tax_rate_id ? ratesById.get(client.default_tax_rate_id) ?? null : null;
  const currency = client?.currency ?? 'CAD';
  const projects = data.projects.filter((p) => !clientId || p.client_id === clientId);
  const locked = !!data.defaults.lockBefore && issue < data.defaults.lockBefore;

  const totals = computeTotals(lines.map((l) => ({ quantity: parseNum(l.quantity), unit_price: parseNum(l.unit_price), tax_rate_id: l.tax_rate_id })), data.rates, parseNum(discount), { gstNumber: data.defaults.gstNumber });
  const sign = kind === 'credit_note' ? -1 : 1;

  // First client pick on a new document fills sensible defaults.
  const firstPick = useRef(!initial.client_id);

  function chooseClient(c: EditorClient) {
    const prevTax = client?.default_tax_rate_id ?? null;
    setClientId(c.id);
    touch();
    if (projectId && !data.projects.some((p) => p.id === projectId && p.client_id === c.id)) setProjectId(null);
    // Place of supply: lines still on the old client's default tax follow the new client.
    setLines((ls) => ls.map((l) => (l.tax_rate_id === prevTax || l.tax_rate_id === null ? { ...l, tax_rate_id: c.default_tax_rate_id } : l)));
    if (kind === 'invoice' && (firstPick.current || preset !== 'custom')) {
      const days = c.terms_days ?? data.defaults.termsDays;
      setDueDays(days, issue);
    }
    firstPick.current = false;
    setPicker(false);
  }

  function setDueDays(days: number, from = issue) {
    const d = format(addDays(parseISO(from), days), 'yyyy-MM-dd');
    setDue(d);
    setPreset(presetFor(from, d, kind));
  }

  function onIssueChange(v: string) {
    if (!v) return;
    touch();
    if (due && preset !== 'custom') {
      const days = differenceInCalendarDays(parseISO(due), parseISO(issue));
      setDue(format(addDays(parseISO(v), days), 'yyyy-MM-dd'));
    }
    setIssue(v);
  }

  function onPreset(p: Preset) {
    touch();
    setPreset(p);
    if (p === 'receipt') setDue(issue);
    else if (p !== 'custom') setDue(format(addDays(parseISO(issue), Number(p)), 'yyyy-MM-dd'));
  }

  const updateLine = (key: string, patch: Partial<EditorLine>) => { touch(); setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); };
  const move = (i: number, d: -1 | 1) => {
    touch();
    setLines((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };
  function removeLine(i: number) {
    const removed = lines[i]!;
    touch();
    setLines((ls) => (ls.length === 1 ? [blankLine(client?.default_tax_rate_id ?? null)] : ls.filter((_, k) => k !== i)));
    if (removed.description || removed.unit_price) {
      toast({ title: `Removed “${removed.description || 'line'}”`, action: {
          label: 'Undo',
          onClick: () => setLines((ls) => {
            if (ls.length === 1 && !ls[0]!.description && !ls[0]!.unit_price) return [removed];
            const n = [...ls];
            n.splice(Math.min(i, n.length), 0, removed);
            return n;
          }),
        } });
    }
  }
  function addLine(item?: EditorData['items'][number]) {
    touch();
    const tax = client?.default_tax_rate_id ?? item?.tax_rate_id ?? null;
    const line: EditorLine = item
      ? { key: newKey(), item_id: item.id, description: item.name, detail: item.description ?? '', quantity: '1', unit: item.unit ?? '', unit_price: item.unit_price ? String(item.unit_price) : '', tax_rate_id: tax }
      : blankLine(tax);
    setLines((ls) => {
      // Replace a single untouched blank line instead of stacking under it.
      if (ls.length === 1 && !ls[0]!.description && !ls[0]!.unit_price) return [line];
      return [...ls, line];
    });
    requestAnimationFrame(() => document.getElementById(`desc-${line.key}`)?.focus());
  }

  const buildInput = useCallback((send: boolean, why?: string): InvoiceInput | string => {
    if (!clientId) return 'Choose a client first.';
    const filled = lines.filter((l) => l.description.trim() || parseNum(l.unit_price));
    if (!filled.length) return 'Add at least one line item.';
    const missing = filled.findIndex((l) => !l.description.trim());
    if (missing >= 0) return `Line ${missing + 1} needs a description.`;
    return {
      id: initial.id ?? null, kind, client_id: clientId, project_id: projectId, title, po_number: po, issue_date: issue,
      due_date: kind === 'credit_note' ? null : due, discount: parseNum(discount), notes, terms, send, reason: why ?? null,
      converted_from: initial.converted_from ?? null, recurring_id: initial.recurring_id ?? null, bill_expense_ids: initial.bill_expense_ids ?? null,
      lines: filled.map((l) => ({ item_id: l.item_id, description: l.description, detail: l.detail, quantity: parseNum(l.quantity), unit: l.unit, unit_price: parseNum(l.unit_price), tax_rate_id: l.tax_rate_id })),
    };
  }, [clientId, lines, initial, kind, projectId, title, po, issue, due, discount, notes, terms]);

  const save = useCallback((send: boolean, why?: string) => {
    if (issued && !why) { setReasonOpen(true); return; }
    const input = buildInput(send, why);
    if (typeof input === 'string') { setError(input); toast({ title: input, tone: 'error' }); if (!clientId) setPicker(true); return; }
    setError(null);
    startTransition(async () => {
      const res = await saveInvoice(input);
      if (!res.ok) { setError(res.error); toast({ title: res.error, tone: 'error' }); return; }
      dirty.current = false;
      setReasonOpen(false);
      toast({ title: res.message ?? 'Saved' });
      router.push(`/invoices/${res.data!.id}`);
    });
  }, [issued, buildInput, toast, clientId, router]);

  // ⌘S saves (as draft for drafts, opens the reason prompt for issued documents).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!pending) save(false); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, [save, pending]);

  const pageTitle = initial.id ? `Edit ${initial.number}` : `New ${label.toLowerCase()}`;
  const sendLabel = kind === 'credit_note' ? 'Save & issue' : 'Save & mark sent';
  const dueLabel = kind === 'estimate' ? 'Valid until' : 'Due';
  const presetOpts: { value: Preset; label: string }[] = kind === 'estimate'
    ? [{ value: '15', label: '15 days' }, { value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: 'custom', label: 'Custom' }]
    : [{ value: 'receipt', label: 'On receipt' }, { value: '7', label: '7 days' }, { value: '15', label: '15 days' }, { value: '30', label: '30 days' }, { value: 'custom', label: 'Custom' }];

  const primary = issued ? (
    <Button variant="filled" loading={pending} disabled={locked} onClick={() => save(false)}>Save changes</Button>
  ) : (
    <>
      <Button variant="gray" disabled={pending || locked} onClick={() => save(false)}>Save draft</Button>
      <Button variant="filled" loading={pending} disabled={locked} onClick={() => save(true)}>{sendLabel}</Button>
    </>
  );

  return (
    <Page
      title={pageTitle}
      subtitle={initial.source_label ?? (issued ? `${label} · revision ${initial.revision ?? 1}` : undefined)}
      back={{ href: backHref, label: initial.id ? initial.number! : kind === 'estimate' ? 'Estimates' : 'Invoices' }}
      actions={<div className="hidden items-center gap-2 lg:flex">{primary}</div>}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div>
          {issued && (
            <div className="mb-5 flex gap-3 rounded-group bg-orange-soft px-4 py-3 text-subhead text-label lg:px-3 lg:py-2.5">
              <span className="mt-0.5 shrink-0 text-orange"><Lock className="size-4" /></span>
              <span>This {label.toLowerCase()} was already sent. Saving keeps a copy of the current version as revision {initial.revision ?? 1} and asks you what changed.</span>
            </div>
          )}
          {locked && (
            <div className="mb-5 rounded-group bg-red-soft px-4 py-3 text-subhead text-red lg:px-3 lg:py-2.5">
              The books are closed before {date(data.defaults.lockBefore)}. Pick a later issue date, or reopen the period in Settings.
            </div>
          )}

          {/* Client */}
          <Section title={kind === 'estimate' ? 'Prepared for' : kind === 'credit_note' ? 'Credit to' : 'Bill to'}>
            <button type="button" onClick={() => setPicker(true)} className="row-press flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left lg:min-h-[52px] lg:px-3">
              {client ? <ClientTile id={client.id} name={client.display_name} size={36} /> : <span className="flex size-9 items-center justify-center rounded-[10px] bg-fill text-label-3"><UserRound className="size-5" /></span>}
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', client ? 'font-medium' : 'text-accent-text')}>{client?.display_name ?? 'Choose client'}</span>
                <span className="block truncate text-footnote text-label-2">{client ? treatmentLabel(client, clientRate) : 'Sets currency, tax and payment terms'}</span>
              </span>
              {client && client.currency !== 'CAD' && <Badge tone="blue">{client.currency}</Badge>}
              <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
            </button>
          </Section>

          {/* Details */}
          <Section title="Details">
            <Input label="Title" placeholder={kind === 'estimate' ? 'e.g. Voice AI receptionist' : 'e.g. Retainer — October 2026'} value={title} onChange={(e) => { touch(); setTitle(e.target.value); }} maxLength={200} />
            <Select
              label="Project"
              value={projectId ?? ''}
              onChange={(e) => { touch(); setProjectId(e.target.value || null); }}
              placeholder={projects.length ? 'None' : clientId ? 'No projects for this client' : 'None'}
              options={projects.map((p) => ({ value: p.id, label: p.name + (p.status === 'done' ? ' (done)' : '') }))}
            />
            {kind !== 'credit_note' && <Input label="PO number" placeholder="Optional" value={po} onChange={(e) => { touch(); setPo(e.target.value); }} maxLength={60} />}
          </Section>

          {/* Dates */}
          <Section title="Dates" footer={kind === 'invoice' && due ? (due === issue ? 'Payable on receipt.' : `Net ${differenceInCalendarDays(parseISO(due), parseISO(issue))} — due ${date(due)}.`) : kind === 'estimate' && due ? `Valid for ${differenceInCalendarDays(parseISO(due), parseISO(issue))} days.` : undefined}>
            <Input label={kind === 'credit_note' ? 'Date' : 'Issued'} type="date" value={issue} onChange={(e) => onIssueChange(e.target.value)} required align="right" />
            {kind !== 'credit_note' && (
              <>
                <div className="px-4 py-2.5 lg:px-3">
                  <div className="mb-2 text-footnote font-medium text-label-2">{dueLabel}</div>
                  <Chips options={presetOpts} value={preset} onChange={onPreset} />
                </div>
                {preset === 'custom' && (
                  <Input label={dueLabel} type="date" value={due ?? ''} min={issue} onChange={(e) => { touch(); setDue(e.target.value || null); }} align="right" />
                )}
              </>
            )}
          </Section>

          {/* Lines */}
          <div className="mb-1.5 flex items-end justify-between px-4 lg:px-1">
            <h2 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:text-caption">Line items</h2>
            <span className="text-footnote text-label-3">{currency !== 'CAD' ? `Amounts in ${currency}` : ''}</span>
          </div>
          <div className="mb-3 space-y-2.5">
            <AnimatePresence initial={false}>
              {lines.map((l, i) => (
                <motion.div key={l.key} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', bounce: 0, duration: 0.32 }}>
                  <LineCard
                    line={l} index={i} count={lines.length} rates={data.rates} currency={currency} sign={sign}
                    onChange={(p) => updateLine(l.key, p)} onMove={(d) => move(i, d)} onRemove={() => removeLine(i)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mb-7">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:flex-wrap lg:px-0">
              <button type="button" onClick={() => addLine()} className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-subhead font-semibold text-accent-text lg:h-8 lg:text-footnote">
                <Plus className="size-4" strokeWidth={2.6} /> Add line
              </button>
              {data.items.map((it) => (
                <button key={it.id} type="button" onClick={() => addLine(it)} title={it.description ?? undefined} className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cell px-3.5 text-subhead shadow-card lg:h-8 lg:text-footnote">
                  {it.name}
                  {it.unit_price > 0 && <span className="tabular text-label-3">{money(it.unit_price, 'CAD', { cents: false })}{it.unit && it.unit !== 'fixed' ? `/${it.unit}` : ''}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Adjustments + notes */}
          <Section title="Adjustments" footer="A discount lowers the taxable amount, spread across the lines.">
            <Input label="Discount" inputMode="decimal" placeholder="0.00" value={discount} align="right" trailing={currency} onChange={(e) => { touch(); setDiscount(e.target.value.replace(/[^\d.]/g, '')); }} />
          </Section>
          <Section title="Notes & terms" footer="Both print on the PDF. Payment instructions come from Settings.">
            <TextArea label="Notes" placeholder="A note to the client" value={notes} onChange={(e) => { touch(); setNotes(e.target.value); }} rows={2} />
            <TextArea label="Terms" placeholder={kind === 'estimate' ? 'e.g. 50% deposit on acceptance, balance on launch.' : 'e.g. 1.5% monthly interest on overdue balances.'} value={terms} onChange={(e) => { touch(); setTerms(e.target.value); }} rows={2} />
          </Section>
          {error && <p className="mb-4 px-4 text-subhead text-red lg:px-1" role="alert">{error}</p>}
          <div className="h-24 lg:hidden" />
        </div>

        {/* Live summary (desktop) */}
        <aside className="sticky top-[76px] hidden lg:block">
          <Totals totals={totals} currency={currency} sign={sign} kind={kind} />
          <div className="mt-4 flex flex-col gap-2">
            {issued ? (
              <Button variant="filled" size="lg" block loading={pending} disabled={locked} onClick={() => save(false)}>Save changes…</Button>
            ) : (
              <>
                <Button variant="filled" size="lg" block loading={pending} disabled={locked} onClick={() => save(true)}>{sendLabel}</Button>
                <Button variant="gray" size="lg" block disabled={pending || locked} onClick={() => save(false)}>Save draft</Button>
              </>
            )}
            <p className="text-center text-caption text-label-3"><kbd className="font-sans">⌘S</kbd> saves {issued ? 'changes' : 'a draft'}</p>
          </div>
        </aside>
      </div>

      {/* Sticky bottom bar (phones) */}
      <div className="fixed inset-x-0 z-30 px-3 lg:hidden" style={{ bottom: 'calc(var(--tabbar-h) + max(var(--safe-bottom), 10px) + 10px)' }}>
        <div className="material-glass mx-auto flex max-w-[440px] items-center gap-2 rounded-[22px] p-2 pl-4">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-caption text-label-2">{kind === 'credit_note' ? 'Credit total' : 'Total'}{totals.taxTotal ? ` · incl. ${money(totals.taxTotal, currency)} tax` : ''}</div>
            <div className="tabular truncate text-headline font-semibold">{money(sign * totals.total, currency)}</div>
          </div>
          {issued ? (
            <Button variant="filled" loading={pending} disabled={locked} onClick={() => save(false)} className="rounded-[14px]">Save</Button>
          ) : (
            <>
              <Button variant="gray" disabled={pending || locked} onClick={() => save(false)} className="rounded-[14px] px-3">Draft</Button>
              <Button variant="filled" loading={pending} disabled={locked} onClick={() => save(true)} className="rounded-[14px] px-3">{kind === 'credit_note' ? 'Issue' : 'Save & send'}</Button>
            </>
          )}
        </div>
      </div>

      <ClientPicker open={picker} onClose={() => setPicker(false)} clients={data.clients} rates={ratesById} value={clientId} onPick={chooseClient} />

      <Sheet
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title="What changed?"
        size="sm"
        fit
        action={<SheetAction loading={pending} disabled={reason.trim().length < 3} onClick={() => save(false, reason.trim())}>Save</SheetAction>}
      >
        <form onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) save(false, reason.trim()); }}>
          <p className="mb-3 px-1 text-footnote text-label-2">
            {initial.number} becomes revision {(initial.revision ?? 1) + 1}. Revision {initial.revision ?? 1} stays on file so you can reproduce the PDF the client already has.
          </p>
          <Section>
            <Input autoFocus placeholder="e.g. Added 6 hours of CRM mapping (approved by Marcus)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} enterKeyHint="done" />
          </Section>
          <Chips
            className="-mt-4 mb-2"
            value={'' as string}
            onChange={(v) => setReason(v)}
            options={['Corrected a quantity', 'Updated the rate', 'Client asked for a change', 'Fixed a typo'].map((v) => ({ value: v, label: v }))}
          />
        </form>
      </Sheet>
    </Page>
  );
}

function LineCard({ line, index, count, rates, currency, sign, onChange, onMove, onRemove }: {
  line: EditorLine; index: number; count: number; rates: EditorData['rates']; currency: string; sign: number;
  onChange: (p: Partial<EditorLine>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const amount = Math.round(parseNum(line.quantity) * parseNum(line.unit_price) * 100) / 100;
  const field = 'h-10 w-full min-w-0 rounded-[10px] bg-fill-2 px-2.5 text-right tabular outline-none focus:bg-fill lg:h-8 lg:rounded-md';
  return (
    <div className="rounded-group bg-cell p-3 shadow-card lg:p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-5 shrink-0 text-center text-caption font-semibold text-label-3 tabular lg:mt-1.5">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <input
            id={`desc-${line.key}`}
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Description"
            aria-label={`Line ${index + 1} description`}
            maxLength={500}
            className="h-9 w-full bg-transparent font-medium outline-none placeholder:font-normal lg:h-7"
          />
          <input
            value={line.detail}
            onChange={(e) => onChange({ detail: e.target.value })}
            placeholder="Detail (optional, prints smaller)"
            aria-label={`Line ${index + 1} detail`}
            maxLength={500}
            className="h-7 w-full bg-transparent text-subhead text-label-2 outline-none lg:h-6"
          />
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up" className="pressable flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-fill-2 hover:text-label disabled:opacity-30 lg:size-7"><ChevronUp className="size-4" /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down" className="pressable flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-fill-2 hover:text-label disabled:opacity-30 lg:size-7"><ChevronDown className="size-4" /></button>
          <button type="button" onClick={onRemove} aria-label="Remove line" className="pressable flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-red-soft hover:text-red lg:size-7"><Trash2 className="size-4" /></button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1.3fr] gap-2 pl-7 lg:grid-cols-[72px_88px_110px_minmax(0,1fr)_110px] lg:items-center">
        <label className="block">
          <span className="mb-0.5 block text-caption2 font-medium uppercase tracking-[0.04em] text-label-3 lg:sr-only">Qty</span>
          <input value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value.replace(/[^\d.\-]/g, '') })} inputMode="decimal" aria-label="Quantity" placeholder="1" className={field} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-caption2 font-medium uppercase tracking-[0.04em] text-label-3 lg:sr-only">Unit</span>
          <input value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label="Unit" placeholder="hour" list="tn-units" maxLength={30} className={cn(field, 'text-left')} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-caption2 font-medium uppercase tracking-[0.04em] text-label-3 lg:sr-only">Price</span>
          <input value={line.unit_price} onChange={(e) => onChange({ unit_price: e.target.value.replace(/[^\d.\-]/g, '') })} inputMode="decimal" aria-label="Unit price" placeholder="0.00" className={field} />
        </label>
        <label className="col-span-2 block lg:col-span-1">
          <span className="mb-0.5 block text-caption2 font-medium uppercase tracking-[0.04em] text-label-3 lg:sr-only">Tax</span>
          <select value={line.tax_rate_id ?? ''} onChange={(e) => onChange({ tax_rate_id: e.target.value || null })} aria-label="Tax" className={cn(field, 'appearance-none text-left text-subhead')}>
            <option value="">No tax</option>
            {rates.filter((r) => r.active || r.id === line.tax_rate_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col items-end justify-end">
          <span className="mb-0.5 block text-caption2 font-medium uppercase tracking-[0.04em] text-label-3 lg:sr-only">Amount</span>
          <span className="tabular flex h-10 items-center font-semibold lg:h-8">{money(sign * amount, currency)}</span>
        </div>
      </div>
      <datalist id="tn-units">{['hour', 'day', 'month', 'session', 'fixed', 'each'].map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  );
}

function Totals({ totals, currency, sign, kind }: { totals: ReturnType<typeof computeTotals>; currency: string; sign: number; kind: string }) {
  const row = 'flex items-baseline justify-between gap-3 py-1 text-subhead';
  return (
    <div className="rounded-group bg-cell p-4 shadow-card">
      <div className="text-footnote font-medium text-label-2">{kind === 'credit_note' ? 'Credit total' : kind === 'estimate' ? 'Estimate total' : 'Total'}</div>
      <div className="tabular mt-0.5 font-display text-title1 font-semibold tracking-[-0.03em]">
        {money(sign * totals.total, currency)}{currency !== 'CAD' && <span className="ml-1 text-subhead font-semibold text-label-2">{currency}</span>}
      </div>
      <div className="mt-3 hairline-t pt-2">
        <div className={row}><span className="text-label-2">Subtotal</span><span className="tabular">{money(sign * totals.subtotal, currency)}</span></div>
        {totals.discount > 0 && <div className={row}><span className="text-label-2">Discount</span><span className="tabular">{money(-sign * totals.discount, currency)}</span></div>}
        {totals.taxes.map((t) => (
          <div key={t.label} className={row}><span className="min-w-0 truncate text-label-2" title={t.label}>{t.label.replace(/ \(BN .*\)$/, '')}</span><span className="tabular">{money(sign * t.amount, currency)}</span></div>
        ))}
        {!totals.taxes.length && <div className={row}><span className="text-label-2">Tax</span><span className="tabular text-label-3">None</span></div>}
      </div>
    </div>
  );
}

function ClientPicker({ open, onClose, clients, rates, value, onPick }: { open: boolean; onClose: () => void; clients: EditorClient[]; rates: Map<string, TaxRate>; value: string | null; onPick: (c: EditorClient) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = clients.filter((c) => (!c.archived || c.id === value) && (!q || `${c.display_name} ${c.company_name ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Sheet open={open} onClose={onClose} title="Choose client" size="md">
      <label className="sticky top-0 z-10 mb-3 flex h-10 items-center gap-1.5 rounded-[10px] bg-fill px-2.5 text-label-2 lg:h-9">
        <Search className="size-4" />
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && list[active]) { e.preventDefault(); onPick(list[active]); }
          }}
          placeholder="Search clients"
          className="h-full flex-1 bg-transparent text-label outline-none"
        />
      </label>
      <div className="group-rows overflow-hidden rounded-group bg-cell shadow-card" style={{ ['--row-inset' as string]: '64px' }}>
        {list.map((c, i) => {
          const t = c.default_tax_rate_id ? rates.get(c.default_tax_rate_id) : null;
          return (
            <button key={c.id} type="button" onClick={() => onPick(c)} onMouseEnter={() => setActive(i)} className={cn('row-press flex w-full items-center gap-3 px-4 py-2.5 text-left lg:px-3 lg:py-2', i === active && 'lg:bg-fill-2')}>
              <ClientTile id={c.id} name={c.display_name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.display_name}</span>
                <span className="block truncate text-footnote text-label-2">{treatmentLabel(c, t)}{c.terms_days ? ` · Net ${c.terms_days}` : ''}</span>
              </span>
              {c.currency !== 'CAD' && <Badge tone="blue">{c.currency}</Badge>}
              {c.id === value && <Check className="size-5 shrink-0 text-accent-text" strokeWidth={2.4} />}
            </button>
          );
        })}
        {!list.length && <div className="px-4 py-8 text-center text-subhead text-label-2">No clients match “{q}”.</div>}
      </div>
      <p className="mt-3 px-1 text-footnote text-label-3">New client? Add them in Clients, then come back.</p>
    </Sheet>
  );
}
