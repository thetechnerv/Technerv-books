'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  ArrowRightLeft, BellRing, Check, CircleSlash, Copy, Download, ExternalLink, FileClock, FilePen, FilePlus2, FileText, HandCoins,
  History, MoreHorizontal, ReceiptText, Repeat, Send, Share, ThumbsDown, ThumbsUp, Trash2, Undo2, Archive, CircleDot, X,
} from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Button, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BigMoney } from '@/components/ui/money';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Input, Select } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { cn } from '@/lib/cn';
import { date, isoToday, money, relativeDay, shortDate } from '@/lib/format';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import { ClientTile } from './client-tile';
import { dueInfo, FREQUENCIES, KIND_LABEL, methodLabel, nextRun, statusLabel, toneClass } from './shared';
import { RecordPaymentSheet, type PaymentFormData } from './payment-sheet';
import { archivePdf, convertEstimate, deleteDraft, markReminded, saveSchedule, setInvoiceStatus } from '@/app/(app)/invoices/actions';

export type TimelineEvent = {
  at: string;
  kind: 'created' | 'sent' | 'payment' | 'revision' | 'reminded' | 'void' | 'accepted' | 'declined' | 'converted' | 'saved';
  title: string;
  sub?: string;
  href?: string;
  amount?: number;
  currency?: string;
  dateOnly?: boolean;
};

type Inv = {
  id: string; kind: 'invoice' | 'estimate' | 'credit_note'; number: string; status: string; title: string | null; client_id: string; client_name: string;
  issue_date: string; due_date: string | null; currency: string; total: number; subtotal: number; tax_total: number; amount_paid: number; balance: number;
  is_overdue: boolean; days_overdue: number; po_number: string | null; project_name: string | null; revision: number; last_payment_on: string | null;
  last_reminded_at: string | null; archived_pdf_path: string | null; updated_at: string; sent_at: string | null; line_count: number; recurring_id: string | null; fx_rate: number;
};

type Props = {
  inv: Inv;
  client: { id: string; display_name: string; company_name: string | null; contact_name: string | null; email: string | null; phone: string | null; currency: string };
  payments: { id: string; received_on: string; amount: number; applied: number; currency: string; method: string; reference: string | null }[];
  revisions: { revision: number; reason: string | null; created_at: string }[];
  events: TimelineEvent[];
  source: { id: string; kind: string; number: string } | null;
  derived: { id: string; kind: string; number: string; status: string }[];
  schedule: { id: string; frequency: string; next_run_on: string; active: boolean } | null;
  business: { name: string; paymentInstructions: string | null; etransferEmail: string | null; lockBefore: string | null };
  me: { firstName: string };
  payData: PaymentFormData | null;
  openPay: boolean;
  initialRev: number | null;
};

const EVENT_STYLE: Record<TimelineEvent['kind'], { icon: typeof FileText; color: string }> = {
  created: { icon: FilePen, color: 'var(--label-3)' },
  sent: { icon: Send, color: 'var(--blue)' },
  payment: { icon: HandCoins, color: 'var(--accent-text)' },
  revision: { icon: History, color: 'var(--orange)' },
  reminded: { icon: BellRing, color: 'var(--purple)' },
  void: { icon: CircleSlash, color: 'var(--red)' },
  accepted: { icon: ThumbsUp, color: 'var(--accent-text)' },
  declined: { icon: ThumbsDown, color: 'var(--red)' },
  converted: { icon: ArrowRightLeft, color: 'var(--ocean)' },
  saved: { icon: Archive, color: 'var(--label-2)' },
};

export function InvoiceDetail(p: Props) {
  const { inv } = p;
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [payOpen, setPayOpen] = useState(p.openPay && inv.kind === 'invoice');
  const [recurOpen, setRecurOpen] = useState(false);
  const [viewRev, setViewRev] = useState<number | null>(p.initialRev && p.initialRev !== inv.revision ? p.initialRev : null);
  const [sharing, setSharing] = useState(false);

  const label = KIND_LABEL[inv.kind];
  const isInvoice = inv.kind === 'invoice';
  const isEstimate = inv.kind === 'estimate';
  const isCredit = inv.kind === 'credit_note';
  const open = isInvoice && (inv.status === 'sent' || inv.status === 'partial');
  const st = statusLabel(inv.kind, inv.status, inv.is_overdue);
  const due = dueInfo(inv);
  const locked = !!p.business.lockBefore && inv.issue_date < p.business.lockBefore;
  const converted = p.derived.find((d) => d.kind === 'invoice');
  const listHref = isEstimate ? '/estimates' : '/invoices';
  const base = `/api/invoices/${inv.id}/pdf`;
  const v = encodeURIComponent(inv.updated_at);
  const pdfUrl = `${base}?v=${v}${viewRev ? `&rev=${viewRev}` : ''}`;
  const fileName = `${inv.number}${viewRev ? `-r${viewRev}` : ''}.pdf`;

  const act = useCallback((fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok?: string, undo?: () => Promise<unknown>) => {
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast({ title: r.error ?? 'Something went wrong', tone: 'error' }); return; }
      toast({
        title: r.message ?? ok ?? 'Done',
        action: undo ? { label: 'Undo', onClick: () => start(async () => { await undo(); router.refresh(); }) } : undefined,
      });
      router.refresh();
    });
  }, [router, toast]);

  async function copyText(t: string, what: string) {
    try { await navigator.clipboard.writeText(t); toast({ title: `Copied ${what}` }); return true; } catch { toast({ title: 'Couldn’t copy to the clipboard', tone: 'error' }); return false; }
  }

  function reminderText() {
    const first = p.client.contact_name?.split(' ').find((w) => !/^(dr|mr|mrs|ms)\.?$/i.test(w)) ?? 'there';
    const amt = `${money(inv.balance, inv.currency)}${inv.currency !== 'CAD' ? ` ${inv.currency}` : ''}`;
    const when = inv.due_date
      ? inv.is_overdue ? `was due on ${date(inv.due_date)} (${inv.days_overdue} ${inv.days_overdue === 1 ? 'day' : 'days'} ago)` : `is due on ${date(inv.due_date)}`
      : 'is now due';
    const how = [p.business.paymentInstructions, p.business.etransferEmail && inv.currency === 'CAD' ? `Interac e-Transfer: ${p.business.etransferEmail}` : null, `Reference: ${inv.number}`].filter(Boolean).join('\n');
    return `Hi ${first},\n\nA friendly reminder that invoice ${inv.number}${inv.title ? ` (${inv.title})` : ''} for ${amt} ${when}. I’ve attached a copy for convenience.\n\n${how}\n\nIf it’s already on its way, thank you — please ignore this note. Let me know if you have any questions.\n\nThanks,\n${p.me.firstName}\n${p.business.name}`;
  }
  async function copyReminder() {
    if (await copyText(reminderText(), 'reminder — paste it into an email')) act(() => markReminded(inv.id), 'Reminder copied');
  }

  async function sharePdf() {
    setSharing(true);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error('Couldn’t make the PDF');
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const data: ShareData = { files: [file], title: `${label} ${inv.number}`, text: `${label} ${inv.number} from ${p.business.name}` };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast({ title: `Downloaded ${fileName}` });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ title: (e as Error).message, tone: 'error' });
    } finally {
      setSharing(false);
    }
  }

  const download = () => {
    const a = Object.assign(document.createElement('a'), { href: `${pdfUrl}&download=1`, download: fileName });
    document.body.appendChild(a); a.click(); a.remove();
  };

  async function voidIt() {
    if (!(await confirm({ title: `Void ${inv.number}?`, message: 'It stays on file with its number but no longer counts as owed or as revenue. This can’t be undone.', confirmLabel: 'Void', destructive: true }))) return;
    act(() => setInvoiceStatus(inv.id, 'void'), `${inv.number} voided`);
  }
  async function deleteIt() {
    if (!(await confirm({ title: `Delete draft ${inv.number}?`, message: 'The draft and its lines are removed.', confirmLabel: 'Delete', destructive: true }))) return;
    start(async () => {
      const r = await deleteDraft(inv.id);
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({ title: r.message ?? 'Deleted' });
      router.push(listHref);
    });
  }
  function convert() {
    start(async () => {
      const r = await convertEstimate(inv.id);
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({ title: r.message ?? 'Converted' });
      router.push(`/invoices/${r.data!.id}`);
    });
  }
  const markSent = () => act(() => setInvoiceStatus(inv.id, 'sent'), isCredit ? 'Credit note issued' : `${inv.number} marked as sent`, () => setInvoiceStatus(inv.id, 'draft'));

  // Desktop shortcuts: D download · P record payment · R copy reminder · ⇧E edit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'd') { e.preventDefault(); download(); }
      if (e.key === 'p' && open) { e.preventDefault(); setPayOpen(true); }
      if (e.key === 'r' && open) { e.preventDefault(); void copyReminder(); }
      if (e.key === 'E' && inv.status !== 'void') { e.preventDefault(); router.push(`/invoices/${inv.id}/edit`); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ───── Primary action for this state ─────
  type Primary = { label: string; icon: React.ReactNode; onClick?: () => void; href?: string } | null;
  const primary: Primary =
    inv.status === 'draft' ? { label: isCredit ? 'Issue credit note' : 'Mark as sent', icon: <Send className="size-4" />, onClick: markSent }
    : open ? { label: 'Record payment', icon: <HandCoins className="size-4" />, onClick: () => setPayOpen(true) }
    : isEstimate && inv.status === 'sent' ? { label: 'Mark accepted', icon: <ThumbsUp className="size-4" />, onClick: () => act(() => setInvoiceStatus(inv.id, 'accepted'), 'Estimate accepted', () => setInvoiceStatus(inv.id, 'sent')) }
    : isEstimate && inv.status === 'accepted' && !converted ? { label: 'Convert to invoice', icon: <ArrowRightLeft className="size-4" />, onClick: convert }
    : isCredit && inv.status === 'sent' ? { label: 'Mark applied', icon: <Check className="size-4" />, onClick: () => act(() => setInvoiceStatus(inv.id, 'applied'), 'Credit marked applied') }
    : null;

  const menu: MenuItem[] = [
    { label: 'Download PDF', icon: <Download />, onSelect: download },
    { label: 'Share PDF', icon: <Share />, onSelect: sharePdf },
    { label: 'Open in new tab', icon: <ExternalLink />, href: pdfUrl, external: true },
    'separator',
    ...(inv.status !== 'void' ? [{ label: inv.status === 'draft' ? 'Edit' : 'Edit (new revision)', icon: <FilePen />, href: `/invoices/${inv.id}/edit`, disabled: locked }] : []),
    { label: 'Duplicate', icon: <Copy />, href: `/invoices/new?from=${inv.id}` },
    { label: 'Copy number', icon: <FileText />, onSelect: () => void copyText(inv.number, inv.number) },
    ...(open ? [{ label: 'Copy reminder', icon: <BellRing />, onSelect: () => void copyReminder() }] : []),
    ...(isEstimate && inv.status !== 'declined' && !converted ? [{ label: 'Convert to invoice', icon: <ArrowRightLeft />, onSelect: convert }] : []),
    ...(isEstimate && inv.status === 'sent' ? [{ label: 'Mark declined', icon: <ThumbsDown />, onSelect: () => act(() => setInvoiceStatus(inv.id, 'declined'), 'Estimate declined', () => setInvoiceStatus(inv.id, 'sent')) }] : []),
    ...(isEstimate && inv.status === 'declined' ? [{ label: 'Mark accepted', icon: <ThumbsUp />, onSelect: () => act(() => setInvoiceStatus(inv.id, 'accepted'), 'Estimate accepted') }] : []),
    ...(isInvoice && inv.status !== 'draft' && inv.status !== 'void' ? [{ label: 'Create credit note', icon: <ReceiptText />, href: `/invoices/new?kind=credit_note&from=${inv.id}` }] : []),
    ...(isInvoice && !p.schedule && inv.status !== 'void' ? [{ label: 'Make recurring…', icon: <Repeat />, onSelect: () => setRecurOpen(true) }] : []),
    ...(inv.status !== 'draft' ? [{ label: 'Save PDF copy to records', icon: <Archive />, onSelect: () => act(() => archivePdf(inv.id)) }] : []),
    'separator',
    ...(inv.status !== 'draft' && inv.status !== 'void' && inv.amount_paid === 0 && inv.status !== 'paid' ? [{ label: 'Back to draft', icon: <Undo2 />, onSelect: () => act(() => setInvoiceStatus(inv.id, 'draft'), 'Moved back to draft') }] : []),
    ...(inv.status !== 'void' && inv.status !== 'draft' && inv.amount_paid === 0 ? [{ label: 'Void…', icon: <CircleSlash />, onSelect: voidIt, destructive: true }] : []),
    ...(inv.status === 'draft' ? [{ label: 'Delete draft…', icon: <Trash2 />, onSelect: deleteIt, destructive: true }] : []),
  ];
  const trimmedMenu = menu.filter((m, i, a) => m !== 'separator' || (i > 0 && a[i - 1] !== 'separator' && i < a.length - 1));

  // ───── Hero numbers ─────
  const heroLabel = inv.status === 'void' ? 'Voided' : isEstimate ? 'Estimate total' : isCredit ? 'Credit total' : inv.status === 'paid' ? 'Paid in full' : inv.status === 'draft' ? 'Total' : 'Amount due';
  const heroValue = isCredit ? -inv.total : open ? inv.balance : inv.total;

  return (
    <Page
      title={inv.number}
      subtitle={`${label} · ${inv.client_name}`}
      back={{ href: listHref, label: isEstimate ? 'Estimates' : 'Invoices' }}
      actions={
        <>
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="gray" size="md" icon={<Download className="size-4" />} onClick={download} title="Download (D)">Download</Button>
            {inv.status !== 'void' && <Button variant="gray" href={`/invoices/${inv.id}/edit`} icon={<FilePen className="size-4" />} disabled={locked} title="Edit (⇧E)">Edit</Button>}
            {primary && (primary.href ? <Button variant="filled" href={primary.href} icon={primary.icon}>{primary.label}</Button> : <Button variant="filled" onClick={primary.onClick} loading={pending} icon={primary.icon} title={open ? 'Record payment (P)' : undefined}>{primary.label}</Button>)}
          </div>
          <Menu items={trimmedMenu} trigger={<IconButton label="More actions"><MoreHorizontal className="size-[22px]" /></IconButton>} />
        </>
      }
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          {/* Hero */}
          <div className="mb-6 rounded-group bg-cell p-5 shadow-card lg:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-footnote font-medium text-label-2">{heroLabel}</div>
                <BigMoney value={heroValue} currency={inv.currency} className={cn('mt-0.5 block text-[40px] leading-[46px] lg:text-[36px] lg:leading-[42px]', inv.status === 'void' && 'text-label-3 line-through')} />
                {inv.currency !== 'CAD' && <div className="text-footnote text-label-3">{inv.currency} · ≈ {money(heroValue * inv.fx_rate)} CAD at {inv.fx_rate.toFixed(4)}</div>}
              </div>
              <Badge tone={st.tone} className="mt-1 shrink-0">{st.label}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-subhead">
              {due.text && <span className={cn('font-medium', toneClass[due.tone])}>{due.text}</span>}
              {open && inv.amount_paid > 0 && <span className="text-label-2">{money(inv.amount_paid, inv.currency)} of {money(inv.total, inv.currency)} paid</span>}
              {inv.last_reminded_at && open && <span className="text-label-3">Reminded {relativeDay(inv.last_reminded_at)}</span>}
            </div>
            {open && inv.amount_paid > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuenow={Math.round((inv.amount_paid / inv.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Paid so far">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (inv.amount_paid / inv.total) * 100)}%` }} />
              </div>
            )}
            <Link href={`/clients/${p.client.id}`} className="row-press -mx-2 mt-4 flex items-center gap-3 rounded-[12px] p-2">
              <ClientTile id={p.client.id} name={inv.client_name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{inv.client_name}</span>
                <span className="block truncate text-footnote text-label-2">{[p.client.contact_name, p.client.email].filter(Boolean).join(' · ') || 'No contact on file'}</span>
              </span>
            </Link>
            {/* Phone quick actions */}
            <div className="mt-4 grid grid-cols-3 gap-2 lg:hidden">
              <QuickAction icon={<Share className="size-5" />} label={sharing ? 'Preparing…' : 'Share'} onClick={sharePdf} disabled={sharing} />
              <QuickAction icon={<Download className="size-5" />} label="Download" onClick={download} />
              {open ? <QuickAction icon={<BellRing className="size-5" />} label="Reminder" onClick={() => void copyReminder()} />
                : inv.status !== 'void' ? <QuickAction icon={<FilePen className="size-5" />} label="Edit" href={`/invoices/${inv.id}/edit`} />
                : <QuickAction icon={<Copy className="size-5" />} label="Duplicate" href={`/invoices/new?from=${inv.id}`} />}
            </div>
          </div>

          {locked && <p className="mb-4 rounded-group bg-orange-soft px-4 py-3 text-subhead">The books are closed before {date(p.business.lockBefore)}, so this {label.toLowerCase()} can’t be changed.</p>}

          {/* PDF */}
          {viewRev && (
            <div className="mb-3 flex items-center gap-2 rounded-group bg-orange-soft px-4 py-2.5 text-subhead">
              <History className="size-4 shrink-0 text-orange" />
              <span className="flex-1">Viewing revision {viewRev} — the version sent before later changes.</span>
              <button type="button" onClick={() => setViewRev(null)} className="inline-flex items-center gap-1 font-semibold text-accent-text"><X className="size-4" />Current</button>
            </div>
          )}
          <PdfViewer src={pdfUrl} label={`${label} ${inv.number} preview`} className="mb-8" />
        </div>

        <aside className="min-w-0">
          {/* Desktop action stack */}
          <div className="mb-6 hidden flex-col gap-2 lg:flex">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="gray" icon={<Share className="size-4" />} onClick={sharePdf} loading={sharing}>Share</Button>
              <Button variant="gray" icon={<ExternalLink className="size-4" />} onClick={() => window.open(pdfUrl, '_blank', 'noopener')}>Open PDF</Button>
              {open && <Button variant="gray" icon={<BellRing className="size-4" />} onClick={() => void copyReminder()} title="Copy reminder (R)" className="col-span-2">Copy reminder email</Button>}
            </div>
            <p className="text-center text-caption text-label-3">
              <kbd className="font-sans">D</kbd> download{open && <> · <kbd className="font-sans">P</kbd> payment · <kbd className="font-sans">R</kbd> reminder</>} · <kbd className="font-sans">⇧E</kbd> edit
            </p>
          </div>

          <Section title="Details">
            <Row title="Issued" value={date(inv.issue_date)} />
            {inv.due_date && !isCredit && <Row title={isEstimate ? 'Valid until' : 'Due'} value={date(inv.due_date)} />}
            {inv.po_number && <Row title="PO number" value={inv.po_number} />}
            {inv.project_name && <Row title="Project" value={inv.project_name} />}
            <Row title="Subtotal" value={money(inv.subtotal, inv.currency)} />
            <Row title="Tax" value={money(inv.tax_total, inv.currency)} />
            <Row title="Total" value={<span className="font-semibold text-label">{money(isCredit ? -inv.total : inv.total, inv.currency)}</span>} />
            {inv.title && <Row title="Title" value={<span className="block max-w-[180px] truncate">{inv.title}</span>} />}
          </Section>

          {isInvoice && (
            <Section title="Payments" inset={58} action={open ? <button type="button" onClick={() => setPayOpen(true)} className="text-footnote font-medium text-accent-text">Record</button> : undefined}>
              {p.payments.map((pm) => (
                <Row
                  key={pm.id}
                  href={`/payments?id=${pm.id}`}
                  icon={<IconTile color="var(--accent)" fg="var(--on-accent)"><HandCoins /></IconTile>}
                  title={money(pm.applied, pm.currency)}
                  subtitle={`${methodLabel(pm.method)} · ${date(pm.received_on)}${pm.reference ? ` · ${pm.reference}` : ''}`}
                />
              ))}
              {!p.payments.length && <div className="px-4 py-3.5 text-subhead text-label-2 lg:px-3">{inv.status === 'void' ? 'Void — nothing to collect.' : 'No payments yet.'}</div>}
              {open && <Row icon={<IconTile color="var(--fill-3)" fg="var(--accent-text)"><HandCoins /></IconTile>} title={<span className="text-accent-text">Record payment</span>} onClick={() => setPayOpen(true)} />}
            </Section>
          )}

          {(p.source || p.derived.length > 0 || p.schedule) && (
            <Section title="Related" inset={58}>
              {p.source && <Row href={`/invoices/${p.source.id}`} icon={<IconTile color="var(--purple)"><FileText /></IconTile>} title={`${KIND_LABEL[p.source.kind as Inv['kind']]} ${p.source.number}`} subtitle={isCredit ? 'Credit issued against this' : 'Created from'} />}
              {p.derived.map((d) => <Row key={d.id} href={`/invoices/${d.id}`} icon={<IconTile color="var(--ocean)"><FilePlus2 /></IconTile>} title={`${KIND_LABEL[d.kind as Inv['kind']]} ${d.number}`} subtitle={statusLabel(d.kind, d.status).label} />)}
              {p.schedule && <Row href="/invoices/recurring" icon={<IconTile color="var(--teal)"><Repeat /></IconTile>} title={`Repeats ${p.schedule.frequency}`} subtitle={p.schedule.active ? `Next draft ${date(p.schedule.next_run_on)}` : 'Paused'} />}
            </Section>
          )}

          {p.revisions.length > 1 || inv.revision > 1 ? (
            <Section title="Revisions" inset={58} footer="Tap a revision to preview the PDF exactly as it was sent.">
              {p.revisions.map((r) => {
                const current = r.revision === inv.revision;
                const showing = current ? !viewRev : viewRev === r.revision;
                return (
                  <Row
                    key={r.revision}
                    onClick={() => { setViewRev(current ? null : r.revision); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    icon={<IconTile color={current ? 'var(--accent)' : 'var(--fill-3)'} fg={current ? 'var(--on-accent)' : 'var(--label-2)'}><FileClock /></IconTile>}
                    title={<>Revision {r.revision}{current && <span className="ml-1.5 text-footnote text-label-3">current</span>}</>}
                    subtitle={[r.reason, shortDate(r.created_at)].filter(Boolean).join(' · ')}
                  >
                    {showing ? <CircleDot className="size-4 shrink-0 text-accent-text" /> : (
                      <a href={`${base}?rev=${r.revision}&download=1`} onClick={(e) => e.stopPropagation()} aria-label={`Download revision ${r.revision}`} className="rounded-full p-1.5 text-label-3 hover:bg-fill-2 hover:text-label"><Download className="size-4" /></a>
                    )}
                  </Row>
                );
              })}
            </Section>
          ) : null}

          {inv.archived_pdf_path && (
            <Section title="Records" inset={58}>
              <Row href={`${base}?archived=1`} icon={<IconTile color="var(--label-2)"><Archive /></IconTile>} title="Saved PDF copy" subtitle={inv.archived_pdf_path.split('/').pop()} />
            </Section>
          )}

          <Section title="Timeline">
            <ol className="px-4 py-3 lg:px-3">
              {p.events.map((e, i) => {
                const s = EVENT_STYLE[e.kind];
                const body = (
                  <>
                    <span className="text-subhead font-medium">{e.title}{e.amount !== undefined && <span className="tabular ml-1.5 text-accent-text">{money(e.amount, e.currency)}</span>}</span>
                    {e.sub && <span className="block text-footnote text-label-2">{e.sub}</span>}
                    <span className="block text-caption text-label-3">{e.dateOnly ? date(e.at.slice(0, 10)) : format(parseISO(e.at), 'MMM d, yyyy · h:mm a')}</span>
                  </>
                );
                return (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < p.events.length - 1 && <span className="absolute bottom-0 left-[11px] top-6 w-px bg-separator" aria-hidden />}
                    <span className="relative z-10 flex size-[23px] shrink-0 items-center justify-center rounded-full bg-fill-2" style={{ color: s.color }}><s.icon className="size-3.5" strokeWidth={2.2} /></span>
                    {e.href ? <Link href={e.href} className="min-w-0 flex-1 hover:underline">{body}</Link> : <span className="min-w-0 flex-1">{body}</span>}
                  </li>
                );
              })}
            </ol>
          </Section>
        </aside>
      </div>

      {/* Bottom action bar (phones) */}
      {primary && (
        <div className="fixed inset-x-0 z-30 px-3 lg:hidden" style={{ bottom: 'calc(var(--tabbar-h) + max(var(--safe-bottom), 10px) + 10px)' }}>
          <div className="material-glass mx-auto flex max-w-[440px] items-center gap-2 rounded-[22px] p-2">
            <Button variant="gray" className="rounded-[14px]" onClick={sharePdf} loading={sharing} icon={<Share className="size-4" />}>Share</Button>
            <Button variant="filled" className="flex-1 rounded-[14px]" onClick={primary.onClick} href={primary.href} loading={pending} icon={primary.icon}>{primary.label}</Button>
          </div>
        </div>
      )}
      {primary && <div className="h-16 lg:hidden" />}

      {p.payData && (
        <RecordPaymentSheet open={payOpen} onClose={() => setPayOpen(false)} data={p.payData} clientId={inv.client_id} invoiceId={inv.id} />
      )}
      <RecurringSheet open={recurOpen} onClose={() => setRecurOpen(false)} inv={inv} />
    </Page>
  );
}

function QuickAction({ icon, label, onClick, href, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const cls = 'pressable flex flex-col items-center gap-1 rounded-[14px] bg-fill-2 py-2.5 text-caption font-medium text-accent-text disabled:opacity-50';
  if (href) return <Link href={href} className={cls}>{icon}{label}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{icon}{label}</button>;
}

function RecurringSheet({ open, onClose, inv }: { open: boolean; onClose: () => void; inv: Inv }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [freq, setFreq] = useState('monthly');
  const firstNext = () => { const n = nextRun(inv.issue_date, 'monthly'); return n < isoToday() ? nextRun(isoToday().slice(0, 8) + '01', 'monthly') : n; };
  const [next, setNext] = useState(firstNext);
  const [end, setEnd] = useState('');
  function save() {
    start(async () => {
      const r = await saveSchedule({ client_id: inv.client_id, template_invoice_id: inv.id, frequency: freq, next_run_on: next, end_on: end || null });
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      toast({ title: r.message ?? 'Saved' });
      onClose();
      router.refresh();
    });
  }
  return (
    <Sheet open={open} onClose={onClose} title="Make recurring" size="sm" fit action={<SheetAction loading={pending} onClick={save}>Save</SheetAction>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <p className="mb-3 px-1 text-footnote text-label-2">Each period, “Create due drafts” copies {inv.number}’s lines into a new draft and updates month names. Nothing is sent automatically.</p>
        <Section>
          <Select label="Repeats" value={freq} onChange={(e) => { setFreq(e.target.value); setNext(nextRun(inv.issue_date, e.target.value)); }} options={FREQUENCIES} />
          <Input label="Next draft" type="date" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} align="right" />
          <Input label="Ends" type="date" value={end} min={next} onChange={(e) => setEnd(e.target.value)} align="right" hint={end ? undefined : 'Optional — leave empty to repeat until paused'} />
        </Section>
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Sheet>
  );
}
