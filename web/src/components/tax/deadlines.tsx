'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { CheckCircle2, FileText, Paperclip, Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Input, Select, TextArea, Toggle } from '@/components/ui/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { uploadAttachment } from '@/components/files/attachments';
import { saveFiling, markFiled, clearFiled, deleteFiling } from '@/app/(app)/tax/actions';
import { date, daysUntil, isoToday, money } from '@/lib/format';
import type { Row as DbRow } from '@/lib/types';

export type Filing = DbRow<'tax_filings'> & { document_title?: string | null };

export const FILING_LABEL: Record<string, string> = { gst: 'GST/HST return', t2: 'T2 corporate return', t4: 'T4 slips', t5: 'T5 slips', other: 'Other filing' };
const KIND_OPTIONS = Object.entries(FILING_LABEL).map(([value, label]) => ({ value, label }));

function fyOf(end: string) { return Number(end.slice(0, 4)); }

export function DateTile({ iso, tone }: { iso: string; tone: 'red' | 'gray' | 'accent' }) {
  const d = new Date(iso + 'T12:00:00');
  const band = tone === 'red' ? 'bg-red' : tone === 'accent' ? 'bg-accent-text' : 'bg-label-3';
  return (
    <span className="flex size-[34px] flex-col items-center justify-center overflow-hidden rounded-[8px] bg-cell shadow-[inset_0_0_0_0.5px_var(--separator-strong)] lg:size-[30px]">
      <span className={`w-full text-center text-[8.5px] font-bold uppercase leading-[11px] text-white ${band}`}>{format(d, 'MMM')}</span>
      <span className="tabular text-[14px] font-semibold leading-[20px] lg:text-[13px] lg:leading-[17px]">{format(d, 'd')}</span>
    </span>
  );
}

/** Deadlines list (tax_filings) with create / edit / mark-filed sheets. */
export function Deadlines({ filings, defaults }: { filings: Filing[]; defaults: { period_start: string; period_end: string } }) {
  const [editing, setEditing] = useState<Filing | 'new' | null>(null);
  const [filing, setFiling] = useState<Filing | null>(null);
  const open = filings.filter((f) => !f.filed_on).sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9'));
  const done = filings.filter((f) => f.filed_on).sort((a, b) => b.period_end.localeCompare(a.period_end));

  return (
    <>
      <Section
        title="Deadlines"
        inset={58}
        action={<button type="button" onClick={() => setEditing('new')} className="pressable inline-flex items-center gap-1 text-footnote font-medium text-accent-text"><Plus className="size-3.5" strokeWidth={2.6} />Add</button>}
      >
        {!open.length && <div className="px-4 py-6 text-center text-subhead text-label-2">Nothing due. Add a filing to track it here.</div>}
        {open.map((f) => {
          const d = f.due_on ? daysUntil(f.due_on) : null;
          return (
            <Row
              key={f.id}
              onClick={() => setFiling(f)}
              icon={f.due_on ? <DateTile iso={f.due_on} tone={d !== null && d <= 21 ? 'red' : 'gray'} /> : <span className="size-[34px]" />}
              title={FILING_LABEL[f.kind] ?? f.kind}
              subtitle={f.notes || `${date(f.period_start)} – ${date(f.period_end)}`}
              value={d === null ? 'No due date' : d < 0 ? 'Overdue' : d === 0 ? 'Today' : `${d} days`}
              detail={f.amount_owing != null ? money(f.amount_owing) : undefined}
            />
          );
        })}
      </Section>
      {done.length > 0 && (
        <Section title="Filed" inset={58}>
          {done.slice(0, 6).map((f) => (
            <Row
              key={f.id}
              onClick={() => setFiling(f)}
              icon={<DateTile iso={f.filed_on!} tone="accent" />}
              title={<span className="flex items-center gap-2">{FILING_LABEL[f.kind] ?? f.kind} <span className="text-label-2">FY{fyOf(f.period_end)}</span></span>}
              subtitle={[f.confirmation, f.document_title ? 'Return in Documents' : null].filter(Boolean).join(' · ') || `Filed ${date(f.filed_on)}`}
              value={f.amount_owing != null ? money(f.amount_owing) : undefined}
              detail={f.paid_on ? `Paid ${date(f.paid_on, 'MMM d')}` : undefined}
            />
          ))}
        </Section>
      )}
      <FilingEditor filing={editing} defaults={defaults} onClose={() => setEditing(null)} />
      <FilingDetail filing={filing} onClose={() => setFiling(null)} onEdit={(f) => { setFiling(null); setEditing(f); }} />
    </>
  );
}

function FilingEditor({ filing, defaults, onClose }: { filing: Filing | 'new' | null; defaults: { period_start: string; period_end: string }; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const f = filing === 'new' ? null : filing;
  const key = filing === 'new' ? 'new' : filing?.id ?? 'none';

  function submit(form: FormData) {
    setError(null);
    start(async () => {
      const r = await saveFiling({
        id: f?.id, kind: String(form.get('kind')), period_start: String(form.get('period_start')), period_end: String(form.get('period_end')),
        due_on: String(form.get('due_on') ?? ''), notes: String(form.get('notes') ?? ''),
      });
      if (!r.ok) return setError(r.error);
      toast({ title: f ? 'Filing updated' : 'Filing added' });
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open={!!filing} onClose={onClose} title={f ? 'Edit filing' : 'New filing'} size="sm" fit action={<SheetAction form="filing-form" loading={pending}>{f ? 'Save' : 'Add'}</SheetAction>}>
      <form id="filing-form" key={key} action={submit} className="pt-2">
        <Section>
          <Select label="Type" name="kind" defaultValue={f?.kind ?? 'gst'} options={KIND_OPTIONS} />
          <Input label="Period from" type="date" name="period_start" required defaultValue={f?.period_start ?? defaults.period_start} align="right" />
          <Input label="Period to" type="date" name="period_end" required defaultValue={f?.period_end ?? defaults.period_end} align="right" />
          <Input label="Due" type="date" name="due_on" defaultValue={f?.due_on ?? ''} align="right" />
        </Section>
        <Section footer="Annual GST/HST: 3 months after year-end. T2: file within 6 months; a CCPC usually pays the balance within 3 months.">
          <TextArea name="notes" placeholder="Notes" defaultValue={f?.notes ?? ''} rows={2} />
        </Section>
        {error && <p className="-mt-4 mb-4 px-4 text-footnote text-red">{error}</p>}
      </form>
    </Sheet>
  );
}

export function FilingDetail({ filing, onClose, onEdit }: { filing: Filing | null; onClose: () => void; onEdit?: (f: Filing) => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attach, setAttach] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const f = filing;

  function submit(form: FormData) {
    if (!f) return;
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    start(async () => {
      const fy = fyOf(f.period_end);
      const r = await markFiled({
        id: f.id, filed_on: String(form.get('filed_on')), confirmation: String(form.get('confirmation') ?? ''),
        amount_owing: String(form.get('amount_owing') ?? ''), paid_on: String(form.get('paid_on') ?? ''),
        attach: attach && file ? { title: `${FILING_LABEL[f.kind] ?? 'Filing'} FY${fy}`, fiscal_year: fy } : null,
      });
      if (!r.ok) return setError(r.error);
      if (file && r.data?.documentId) {
        try { await uploadAttachment(file, 'document', r.data.documentId); }
        catch (e) { toast({ title: `Marked filed, but the upload failed: ${(e as Error).message}`, tone: 'error' }); }
      }
      const prev = { filed_on: f.filed_on, confirmation: f.confirmation, amount_owing: f.amount_owing, paid_on: f.paid_on };
      toast({ title: f.filed_on ? 'Filing updated' : 'Marked as filed', action: f.filed_on ? undefined : { label: 'Undo', onClick: async () => { await clearFiled(f.id, prev); router.refresh(); } } });
      onClose();
      router.refresh();
    });
  }

  async function remove() {
    if (!f) return;
    if (!(await confirm({ title: 'Delete this filing?', message: 'It will be removed from your deadlines. Documents stay in the vault.', confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteFiling(f.id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Filing deleted' });
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={!!f} onClose={onClose} title={f ? FILING_LABEL[f.kind] : ''} size="md" fit action={<SheetAction form="filed-form" loading={pending}>{f?.filed_on ? 'Save' : 'Mark filed'}</SheetAction>}>
      {f && (
        <form id="filed-form" key={f.id} action={submit} className="pt-1">
          <div className="mb-5 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-title3 font-semibold">FY{fyOf(f.period_end)}</span>
              {f.filed_on ? <Badge tone="accent"><CheckCircle2 className="size-3" />Filed {date(f.filed_on)}</Badge> : f.due_on ? <Badge tone={daysUntil(f.due_on) < 0 ? 'red' : 'orange'}>Due {date(f.due_on)}</Badge> : null}
            </div>
            <p className="mt-0.5 text-subhead text-label-2">{date(f.period_start)} – {date(f.period_end)}{f.notes ? ` · ${f.notes}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {f.kind === 'gst' && <Button size="sm" variant="tinted" href={`/tax/gst?fy=${fyOf(f.period_end)}`}>Open worksheet</Button>}
              {f.kind === 't2' && <Button size="sm" variant="tinted" href={`/tax/year-end?fy=${fyOf(f.period_end)}`}>Year-end package</Button>}
              {onEdit && <Button size="sm" variant="gray" type="button" onClick={() => onEdit(f)}>Edit details</Button>}
            </div>
          </div>
          <Section title={f.filed_on ? 'Filing record' : 'Mark as filed'}>
            <Input label="Filed on" type="date" name="filed_on" required defaultValue={f.filed_on ?? isoToday()} max={isoToday()} align="right" />
            <Input label="Confirmation" name="confirmation" placeholder="From My Business Account" defaultValue={f.confirmation ?? ''} align="right" autoComplete="off" />
            <Input label="Amount owing" name="amount_owing" inputMode="decimal" placeholder="0.00 (− for refund)" defaultValue={f.amount_owing ?? ''} align="right" />
            <Input label="Paid on" type="date" name="paid_on" defaultValue={f.paid_on ?? ''} align="right" />
          </Section>
          <Section title="Filed return" footer={f.document_id ? undefined : 'The PDF goes into Documents under this fiscal year.'}>
            {f.document_id ? (
              <Row href={`/documents?id=${f.document_id}`} icon={<FileText className="size-5 text-label-2" />} title={f.document_title ?? 'Filed return'} subtitle="In Documents" />
            ) : (
              <>
                <Toggle label="Save a copy to Documents" checked={attach} onChange={setAttach} />
                {attach && (
                  <div className="px-4 py-2.5 lg:px-3">
                    <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
                    <Button type="button" size="sm" variant="gray" icon={<Paperclip className="size-4" />} onClick={() => fileRef.current?.click()}>{fileName ?? 'Choose the filed return (PDF)'}</Button>
                  </div>
                )}
              </>
            )}
          </Section>
          {error && <p className="-mt-4 mb-4 px-4 text-footnote text-red">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2 px-1 pb-2">
            {f.filed_on ? (
              <Button type="button" size="sm" variant="plain" onClick={() => start(async () => { const r = await clearFiled(f.id); if (!r.ok) return setError(r.error); toast({ title: 'Marked as not filed' }); onClose(); router.refresh(); })}>Mark as not filed</Button>
            ) : <span />}
            <Button type="button" size="sm" variant="plain" className="text-red" onClick={remove}>Delete filing</Button>
          </div>
          <p className="px-1 pb-2 text-footnote text-label-3">
            Need the official return? File in <Link className="text-accent-text" href="https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/business-account.html" target="_blank">CRA My Business Account</Link>, then record it here.
          </p>
        </form>
      )}
    </Sheet>
  );
}

/**
 * "Mark as filed" for a return shown elsewhere (e.g. the GST worksheet).
 * Creates the filing record first when the period isn't tracked yet.
 */
export function FilingButton({ filing, create, label }: { filing: Filing | null; create: { kind: string; period_start: string; period_end: string; due_on: string | null; notes?: string }; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<Filing | null>(null);
  const [pending, start] = useTransition();
  function go() {
    if (filing) return setOpen(filing);
    start(async () => {
      const r = await saveFiling(create);
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      setOpen({
        id: r.data!.id, kind: create.kind, period_start: create.period_start, period_end: create.period_end, due_on: create.due_on, notes: create.notes ?? null,
        filed_on: null, confirmation: null, amount_owing: null, paid_on: null, document_id: null, worksheet: {}, filed_by: null, created_at: new Date().toISOString(),
      });
      router.refresh();
    });
  }
  return (
    <>
      <Button size="sm" variant={filing?.filed_on ? 'gray' : 'filled'} loading={pending} onClick={go} icon={filing?.filed_on ? <CheckCircle2 className="size-4" /> : undefined}>
        {label ?? (filing?.filed_on ? 'Filed' : 'Mark as filed')}
      </Button>
      <FilingDetail filing={open} onClose={() => setOpen(null)} />
    </>
  );
}
