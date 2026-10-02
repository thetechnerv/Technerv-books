'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2, FileText, Landmark, Plus, Search, SlidersHorizontal, ShieldCheck, ScrollText, Stamp, FileSignature, Receipt, FolderOpen, Check, Paperclip, X, Clock,
} from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Segmented } from '@/components/ui/segmented';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Input, Select, TextArea } from '@/components/ui/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { Attachments, uploadAttachment, type Attachment } from '@/components/files/attachments';
import { createDocument, updateDocument, deleteDocument, type DocumentInput } from '@/app/(app)/documents/actions';
import { DOC_TYPES, DOC_TYPE, EXPIRING_DAYS } from './types';
import { bytes, date, daysUntil, isoToday, plural } from '@/lib/format';
import { cn } from '@/lib/cn';

export type VaultDoc = {
  id: string; title: string; doc_type: string; fiscal_year: number | null; issued_on: string | null; expires_on: string | null; notes: string | null;
  account_id: string | null; period_start: string | null; period_end: string | null; created_at: string; files: Attachment[];
};
export type VaultAccount = { id: string; name: string; kind: string; last4: string | null };
export type CoverageRow = { account: VaultAccount & { currency: string }; cells: { month: string; label: string; long: string; start: string; end: string; docs: { id: string; title: string; files: number }[] }[]; have: number };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  corporate: Building2, gst_return: Receipt, t2_return: ScrollText, notice_of_assessment: Stamp, contract: FileSignature, insurance: ShieldCheck, statement: Landmark, other: FileText,
};

type Draft = Partial<DocumentInput> & { id?: string };

export function Vault({ docs, accounts, years, trackerFy, coverage, initial }: {
  docs: VaultDoc[]; accounts: VaultAccount[]; years: number[]; trackerFy: number;
  coverage: { rows: CoverageRow[]; have: number; expected: number; months: { key: string; label: string; long: string }[] };
  initial: { q: string; type: string; fy: string; id: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState(initial.type);
  const [fy, setFy] = useState(initial.fy);
  const [openId, setOpenId] = useState<string | null>(initial.id);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Keep filters (and the open document) in the URL.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (fy) sp.set('fy', fy);
      if (type) sp.set('type', type);
      if (q.trim()) sp.set('q', q.trim());
      if (openId) sp.set('id', openId);
      const s = sp.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, type, fy, openId, pathname, router]);

  const today = isoToday();
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return docs.filter((d) =>
      (!type || d.doc_type === type) &&
      (!fy || String(d.fiscal_year ?? 'none') === fy) &&
      (!s || `${d.title} ${d.notes ?? ''} ${DOC_TYPE[d.doc_type]?.label ?? ''} ${d.files.map((f) => f.file_name).join(' ')} ${d.account_id ? accountName.get(d.account_id) : ''}`.toLowerCase().includes(s)));
  }, [docs, q, type, fy, accountName]);

  const expiring = docs.filter((d) => d.expires_on && daysUntil(d.expires_on) <= EXPIRING_DAYS).sort((a, b) => a.expires_on!.localeCompare(b.expires_on!));
  const groups = useMemo(() => {
    const byYear = new Map<string, VaultDoc[]>();
    for (const d of shown) { const k = d.fiscal_year ? String(d.fiscal_year) : 'none'; byYear.set(k, [...(byYear.get(k) ?? []), d]); }
    return [...byYear.entries()].sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : Number(b) - Number(a))).map(([year, list]) => ({
      year,
      types: DOC_TYPES.map((t) => ({ ...t, docs: list.filter((d) => d.doc_type === t.value).sort((a, b) => (b.issued_on ?? '').localeCompare(a.issued_on ?? '')) })).filter((t) => t.docs.length),
    }));
  }, [shown]);
  const open = docs.find((d) => d.id === openId) ?? null;
  const filtered = !!(q || type || fy);

  const fyOptions = [{ value: '', label: 'All' }, ...years.map((y) => ({ value: String(y), label: `FY${y}` }))];

  return (
    <Page
      title="Documents"
      subtitle={`${plural(docs.length, 'document')} · ${bytes(docs.reduce((s, d) => s + d.files.reduce((t, f) => t + Number(f.size_bytes ?? 0), 0), 0))}`}
      actions={<Button size="sm" variant="filled" icon={<Plus className="size-4" />} onClick={() => setDraft({ doc_type: 'other', fiscal_year: trackerFy, issued_on: today })}>Upload</Button>}
      toolbar={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Segmented options={fyOptions} value={fy} onChange={setFy} className="lg:w-auto" />
          <div className="flex flex-1 items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3 lg:h-7 lg:max-w-xs lg:rounded-[7px]">
              <Search className="size-4 shrink-0 text-label-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents" className="min-w-0 flex-1 bg-transparent text-body outline-none lg:text-subhead" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="text-label-3"><X className="size-4" /></button>}
            </label>
            <Menu
              label="Filter by type"
              trigger={
                <button type="button" className={cn('pressable inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-subhead font-medium lg:h-7 lg:rounded-[7px] lg:text-footnote', type ? 'bg-label text-bg' : 'bg-fill text-label')}>
                  <SlidersHorizontal className="size-4" />{type ? DOC_TYPE[type]?.label : 'Type'}
                </button>
              }
              items={[{ label: 'All types', onSelect: () => setType(''), icon: !type ? <Check /> : undefined }, 'separator',
                ...DOC_TYPES.map((t) => ({ label: t.label, onSelect: () => setType(t.value), icon: type === t.value ? <Check /> : undefined }))]}
            />
          </div>
        </div>
      }
    >
      {expiring.length > 0 && !filtered && (
        <Section title="Expiring soon" inset={58}>
          {expiring.map((d) => <DocRow key={d.id} d={d} onOpen={setOpenId} accountName={accountName} />)}
        </Section>
      )}

      <div id="statements" className="scroll-mt-32" />
      {(!filtered || type === 'statement') && (
        <StatementsTracker
          fy={trackerFy} coverage={coverage} years={years}
          onOpen={setOpenId}
          onUpload={(acc, m) => setDraft({
            doc_type: 'statement', account_id: acc.id, fiscal_year: trackerFy, period_start: m.start, period_end: m.end, issued_on: m.end,
            title: `${acc.name} statement — ${m.long}`,
          })}
        />
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title={filtered ? 'No matching documents' : 'Nothing in the vault yet'}
          message={filtered ? 'Try another year, type or search.' : 'Upload incorporation papers, filed returns, notices of assessment, contracts and statements so they’re ready at tax time.'}
          action={filtered ? <Button variant="gray" onClick={() => { setQ(''); setType(''); setFy(''); }}>Clear filters</Button> : <Button variant="filled" onClick={() => setDraft({ doc_type: 'other', fiscal_year: trackerFy, issued_on: today })}>Upload a document</Button>}
        />
      ) : groups.map((g) => (
        <div key={g.year} className="mb-2">
          <h2 className="mb-2 mt-1 px-4 text-title3 font-bold lg:px-1">{g.year === 'none' ? 'No fiscal year' : `FY${g.year}`}</h2>
          {g.types.map((t) => (
            <Section key={t.value} title={`${t.plural} · ${t.docs.length}`} inset={58}>
              {t.docs.map((d) => <DocRow key={d.id} d={d} onOpen={setOpenId} accountName={accountName} />)}
            </Section>
          ))}
        </div>
      ))}

      <p className="px-4 pb-4 text-footnote text-label-3 lg:px-1">Keep tax records for six years after the end of the year they relate to.</p>

      <DocumentEditor draft={draft} accounts={accounts} onClose={() => setDraft(null)} onSaved={(id, created) => { setDraft(null); if (created) setOpenId(id); router.refresh(); }} />
      <DocumentDetail doc={open} accountName={accountName} onClose={() => setOpenId(null)} onEdit={(d) => setDraft({ ...d, id: d.id })} />
    </Page>
  );
}

function DocRow({ d, onOpen, accountName }: { d: VaultDoc; onOpen: (id: string) => void; accountName: Map<string, string> }) {
  const t = DOC_TYPE[d.doc_type] ?? DOC_TYPE.other!;
  const Icon = ICONS[d.doc_type] ?? FileText;
  const left = d.expires_on ? daysUntil(d.expires_on) : null;
  return (
    <Row
      onClick={() => onOpen(d.id)}
      icon={<IconTile color={t.color}><Icon /></IconTile>}
      title={<span className="flex items-center gap-2"><span className="truncate">{d.title}</span>{left !== null && left <= EXPIRING_DAYS && <Badge tone={left < 0 ? 'red' : 'orange'}>{left < 0 ? 'Expired' : left === 0 ? 'Expires today' : `${left}d left`}</Badge>}</span>}
      subtitle={[
        d.doc_type === 'statement' && d.account_id ? accountName.get(d.account_id) : t.label,
        d.issued_on ? date(d.issued_on) : null,
        d.files.length ? plural(d.files.length, 'file') : 'No file',
      ].filter(Boolean).join(' · ')}
      chevron
    >
      {!d.files.length && <Paperclip className="size-4 shrink-0 text-orange" aria-label="No file attached" />}
    </Row>
  );
}

function StatementsTracker({ fy, coverage, onOpen, onUpload }: {
  fy: number; years: number[]; coverage: { rows: CoverageRow[]; have: number; expected: number; months: { key: string; label: string; long: string }[] };
  onOpen: (id: string) => void; onUpload: (acc: CoverageRow['account'], m: CoverageRow['cells'][number]) => void;
}) {
  const pct = coverage.expected ? Math.round((coverage.have / coverage.expected) * 100) : 100;
  return (
    <Section
      title={`Statements · FY${fy} · ${coverage.have} of ${coverage.expected}`}
      action={<span className="tabular text-footnote font-medium text-label-2">{pct}%</span>}
      footer="One statement per month for each bank and card account. Tap + to upload a missing month. Change the year with the FY filter."
    >
      {coverage.rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-subhead text-label-2">Add a bank or card account in Settings to track statements.</div>
      ) : (
        <div className="overflow-x-auto px-4 py-3 lg:px-3">
          <table className="w-full border-separate border-spacing-[3px] text-left">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] bg-cell pr-2 text-footnote font-medium text-label-2 lg:text-caption"><span className="sr-only">Account</span></th>
                {coverage.months.map((m) => <th key={m.key} title={m.long} className="text-center text-caption2 font-medium uppercase text-label-3">{m.label.slice(0, 3)}</th>)}
              </tr>
            </thead>
            <tbody>
              {coverage.rows.map((r) => (
                <tr key={r.account.id}>
                  <th scope="row" className="sticky left-0 z-[1] max-w-[9rem] bg-cell pr-2 text-left font-normal">
                    <span className="block truncate text-subhead lg:text-footnote">{r.account.name}</span>
                    <span className="block text-caption text-label-3">{r.have}/{r.cells.length}{r.account.last4 ? ` · ••${r.account.last4}` : ''}</span>
                  </th>
                  {r.cells.map((c) => (
                    <td key={c.month} className="p-0">
                      {c.docs.length ? (
                        <button type="button" onClick={() => onOpen(c.docs[0]!.id)} title={`${c.long}: ${c.docs[0]!.title}`} aria-label={`${r.account.name} ${c.long} statement on file`}
                          className={cn('pressable flex size-9 items-center justify-center rounded-[8px] lg:size-7', c.docs[0]!.files ? 'bg-accent-soft text-accent-text' : 'bg-orange-soft text-orange')}>
                          {c.docs[0]!.files ? <Check className="size-4" strokeWidth={2.6} /> : <Paperclip className="size-3.5" />}
                        </button>
                      ) : (
                        <button type="button" onClick={() => onUpload(r.account, c)} title={`Upload ${c.long}`} aria-label={`Upload ${r.account.name} ${c.long} statement`}
                          className="pressable flex size-9 items-center justify-center rounded-[8px] border border-dashed border-separator-strong text-label-3 hover:border-accent hover:text-accent-text lg:size-7">
                          <Plus className="size-3.5" strokeWidth={2.4} />
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function DocumentEditor({ draft, accounts, onClose, onSaved }: { draft: Draft | null; accounts: VaultAccount[]; onClose: () => void; onSaved: (id: string, created: boolean) => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState(draft?.doc_type ?? 'other');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const editing = !!draft?.id;
  const key = draft ? `${draft.id ?? 'new'}:${draft.title ?? ''}:${draft.period_start ?? ''}` : 'none';
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); setDocType(draft?.doc_type ?? 'other'); setFiles([]); setError(null); setProgress(null); }

  function submit(form: FormData) {
    setError(null);
    const input: DocumentInput = {
      title: String(form.get('title') ?? ''), doc_type: String(form.get('doc_type') ?? 'other'), fiscal_year: String(form.get('fiscal_year') ?? ''),
      issued_on: String(form.get('issued_on') ?? ''), expires_on: String(form.get('expires_on') ?? ''), notes: String(form.get('notes') ?? ''),
      account_id: String(form.get('account_id') ?? ''), period_start: String(form.get('period_start') ?? ''), period_end: String(form.get('period_end') ?? ''),
    };
    start(async () => {
      let id = draft?.id ?? '';
      if (editing) {
        const r = await updateDocument(id, input);
        if (!r.ok) return setError(r.error);
      } else {
        const r = await createDocument(input);
        if (!r.ok) return setError(r.error);
        id = r.data!.id;
      }
      let saved = 0;
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        try { saved += (await uploadAttachment(files[i]!, 'document', id)).saved; }
        catch (e) { toast({ title: `${files[i]!.name}: ${(e as Error).message}`, tone: 'error' }); }
      }
      setProgress(null);
      toast({ title: editing ? 'Document updated' : files.length ? `Saved with ${plural(files.length, 'file')}${saved > 20_000 ? ` · ${bytes(saved)} saved` : ''}` : 'Document saved' });
      onSaved(id, !editing);
    });
  }

  return (
    <Sheet open={!!draft} onClose={onClose} title={editing ? 'Edit document' : 'Upload document'} size="md" action={<SheetAction form="doc-form" loading={pending}>{editing ? 'Save' : 'Add'}</SheetAction>}>
      {draft && (
        <form id="doc-form" key={key} action={submit} className="pt-2">
          <Section>
            <Input name="title" label="Title" required defaultValue={draft.title ?? ''} placeholder="e.g. Notice of Assessment — T2 FY2026" autoFocus={!draft.title} />
            <Select name="doc_type" label="Type" value={docType} onChange={(e) => setDocType(e.target.value)} options={DOC_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            <Input name="fiscal_year" label="Fiscal year" inputMode="numeric" defaultValue={draft.fiscal_year ?? ''} placeholder="2026" align="right" />
            <Input name="issued_on" label="Issued" type="date" defaultValue={draft.issued_on ?? ''} align="right" />
            <Input name="expires_on" label="Expires" type="date" defaultValue={draft.expires_on ?? ''} align="right" />
          </Section>
          {docType === 'statement' && (
            <Section title="Statement" footer="Used by the statements tracker to tick off the months this statement covers.">
              <Select name="account_id" label="Account" defaultValue={draft.account_id ?? ''} placeholder="Choose…" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              <Input name="period_start" label="From" type="date" defaultValue={draft.period_start ?? ''} align="right" />
              <Input name="period_end" label="To" type="date" defaultValue={draft.period_end ?? ''} align="right" />
            </Section>
          )}
          <Section>
            <TextArea name="notes" placeholder="Notes" defaultValue={draft.notes ?? ''} rows={2} />
          </Section>
          {!editing && (
            <Section title="Files" footer="PDFs are stored as-is; photos are compressed. Add more later from the document.">
              <div className="flex flex-wrap items-center gap-2 p-3">
                {files.map((f, i) => (
                  <span key={i} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-fill pl-3 pr-1 text-footnote">
                    <FileText className="size-3.5 shrink-0 text-label-2" /><span className="truncate">{f.name}</span><span className="text-label-3">{bytes(f.size)}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} className="flex size-6 items-center justify-center rounded-full text-label-3 hover:bg-fill-3"><X className="size-3.5" /></button>
                  </span>
                ))}
                <input ref={picker} type="file" multiple hidden accept="application/pdf,image/*,.csv,.txt,.doc,.docx,.xls,.xlsx" onChange={(e) => { setFiles((xs) => [...xs, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
                <Button type="button" size="sm" variant="tinted" icon={<Paperclip className="size-4" />} onClick={() => picker.current?.click()}>{files.length ? 'Add more' : 'Choose files'}</Button>
              </div>
            </Section>
          )}
          {progress && <p className="-mt-4 mb-4 flex items-center gap-2 px-4 text-footnote text-label-2"><Clock className="size-3.5" />{progress}</p>}
          {error && <p className="-mt-4 mb-4 px-4 text-footnote text-red">{error}</p>}
        </form>
      )}
    </Sheet>
  );
}

function DocumentDetail({ doc, accountName, onClose, onEdit }: { doc: VaultDoc | null; accountName: Map<string, string>; onClose: () => void; onEdit: (d: VaultDoc) => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const t = doc ? DOC_TYPE[doc.doc_type] ?? DOC_TYPE.other! : null;
  const Icon = doc ? ICONS[doc.doc_type] ?? FileText : FileText;
  const left = doc?.expires_on ? daysUntil(doc.expires_on) : null;

  async function remove() {
    if (!doc) return;
    if (!(await confirm({ title: 'Delete this document?', message: doc.files.length ? `${doc.title} and its ${plural(doc.files.length, 'file')} will be permanently deleted.` : doc.title, confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteDocument(doc.id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Document deleted' });
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={!!doc} onClose={onClose} title={t?.label} cancelLabel="Done" size="lg" action={doc && <SheetAction onClick={() => onEdit(doc)}>Edit</SheetAction>}>
      {doc && t && (
        <div className="pt-1">
          <div className="mb-5 flex items-start gap-3 px-1">
            <IconTile color={t.color} size={44}><Icon /></IconTile>
            <div className="min-w-0 flex-1">
              <h3 className="text-title3 font-semibold">{doc.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="gray">{doc.fiscal_year ? `FY${doc.fiscal_year}` : 'No fiscal year'}</Badge>
                {left !== null && <Badge tone={left < 0 ? 'red' : left <= EXPIRING_DAYS ? 'orange' : 'gray'}>{left < 0 ? `Expired ${date(doc.expires_on)}` : `Expires ${date(doc.expires_on)}`}</Badge>}
              </div>
            </div>
          </div>
          <Section>
            {doc.issued_on && <Row title="Issued" value={date(doc.issued_on)} />}
            {doc.doc_type === 'statement' && <Row title="Account" value={doc.account_id ? accountName.get(doc.account_id) ?? '—' : 'Not set'} />}
            {doc.doc_type === 'statement' && (doc.period_start || doc.period_end) && <Row title="Period" value={`${date(doc.period_start)} – ${date(doc.period_end)}`} />}
            <Row title="Added" value={date(doc.created_at)} />
          </Section>
          {doc.notes && <Section title="Notes"><p className="whitespace-pre-wrap px-4 py-3 text-body lg:px-3 lg:text-subhead">{doc.notes}</p></Section>}
          <Section title={`Files · ${doc.files.length}`} footer="Tap a file to preview or download it.">
            <Attachments entity="document" entityId={doc.id} items={doc.files} />
          </Section>
          <div className="flex justify-center pb-2">
            <Button variant="plain" size="sm" className="text-red" onClick={remove}>Delete document</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
