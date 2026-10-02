import { notFound } from 'next/navigation';
import { db, must } from '@/lib/db';
import { allMembers, businessProfile, currentMember } from '@/lib/session';
import { num } from '@/lib/format';
import { InvoiceDetail, type TimelineEvent } from '@/components/invoices/detail';
import { paymentFormData } from '@/components/invoices/payment-data';
import { KIND_LABEL, methodLabel } from '@/components/invoices/shared';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: 'Invoice' };
  const supabase = await db();
  const { data } = await supabase.from('invoices').select('number, kind').eq('id', id).maybeSingle();
  return { title: data ? `${KIND_LABEL[data.kind]} ${data.number}` : 'Invoice' };
}

const LOGGED = ['sent', 'reminded', 'voided', 'accepted', 'declined', 'converted', 'applied', 'saved PDF of', 'moved to draft'];

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pay?: string; rev?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await db();
  const inv = must(await supabase.from('invoice_overview').select('*').eq('id', id).maybeSingle());
  if (!inv || !inv.id) notFound();

  const [me, members, profile, client, lines, allocs, revisions, logs, derived, source, schedule] = await Promise.all([
    currentMember(),
    allMembers(),
    businessProfile(),
    supabase.from('clients').select('id, display_name, company_name, contact_name, email, phone, currency').eq('id', inv.client_id!).single(),
    supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', id),
    supabase.from('payment_allocations').select('amount, payments(id, received_on, amount, currency, method, reference, created_at, recorded_by)').eq('invoice_id', id),
    supabase.from('invoice_revisions').select('revision, reason, created_at, created_by').eq('invoice_id', id).order('revision'),
    supabase.from('activity_log').select('action, created_at, member_id, summary').eq('entity_type', 'invoices').eq('entity_id', id).in('action', LOGGED).order('created_at'),
    supabase.from('invoices').select('id, kind, number, created_at, status').eq('converted_from', id),
    inv.converted_from ? supabase.from('invoices').select('id, kind, number').eq('id', inv.converted_from).maybeSingle() : Promise.resolve({ data: null, error: null }),
    inv.recurring_id ? supabase.from('recurring_invoices').select('id, frequency, next_run_on, active').eq('id', inv.recurring_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const who = (mid: string | null | undefined) => members.find((m) => m.id === mid)?.full_name.split(' ')[0] ?? null;
  const payments = must(allocs).map((a) => ({ ...a.payments!, applied: num(a.amount) })).sort((a, b) => a.received_on.localeCompare(b.received_on));
  const revs = must(revisions);
  const log = must(logs);
  const label = KIND_LABEL[inv.kind!];

  const events: TimelineEvent[] = [];
  events.push({ at: inv.created_at!, kind: 'created', title: source.data ? `Created from ${KIND_LABEL[source.data.kind].toLowerCase()} ${source.data.number}` : `${label} created`, sub: who(inv.created_by) ? `by ${who(inv.created_by)}` : undefined, href: source.data ? `/invoices/${source.data.id}` : undefined });
  if (inv.sent_at && !log.some((l) => l.action === 'sent')) events.push({ at: inv.sent_at, kind: 'sent', title: inv.kind === 'credit_note' ? 'Issued' : 'Marked as sent' });
  for (const l of log) {
    const by = who(l.member_id);
    const t: Record<string, [TimelineEvent['kind'], string]> = {
      sent: ['sent', inv.kind === 'credit_note' ? 'Issued' : 'Marked as sent'], reminded: ['reminded', 'Reminder copied'], voided: ['void', 'Voided'],
      accepted: ['accepted', 'Accepted by client'], declined: ['declined', 'Declined by client'], converted: ['converted', 'Converted to invoice'],
      applied: ['accepted', 'Credit applied'], 'saved PDF of': ['saved', 'PDF saved to records'], 'moved to draft': ['created', 'Moved back to draft'],
    };
    const [kind, title] = t[l.action] ?? ['created', l.action];
    events.push({ at: l.created_at, kind, title, sub: [by && `by ${by}`, l.action === 'saved PDF of' ? l.summary?.replace(/^.*\((.*)\)$/, '$1') : null].filter(Boolean).join(' · ') || undefined });
  }
  if (inv.last_reminded_at && !log.some((l) => l.action === 'reminded')) events.push({ at: inv.last_reminded_at, kind: 'reminded', title: 'Reminder copied' });
  for (const p of payments) {
    events.push({ at: `${p.received_on}T12:00:00`, kind: 'payment', title: `Payment received`, sub: `${methodLabel(p.method)}${p.reference ? ` · ${p.reference}` : ''}`, amount: p.applied, currency: p.currency, dateOnly: true });
  }
  for (const r of revs) {
    if (r.revision === 1) continue;
    events.push({ at: r.created_at, kind: 'revision', title: `Revised to revision ${r.revision}`, sub: [r.reason, who(r.created_by) && `by ${who(r.created_by)}`].filter(Boolean).join(' · ') });
  }
  for (const d of must(derived)) {
    events.push({ at: d.created_at, kind: 'converted', title: `${KIND_LABEL[d.kind]} ${d.number} created`, href: `/invoices/${d.id}` });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const revRows = [...revs];
  if (!revRows.some((r) => r.revision === inv.revision)) revRows.push({ revision: inv.revision!, reason: inv.revision === 1 ? (inv.status === 'draft' ? 'Draft' : 'Original issue') : null, created_at: inv.updated_at!, created_by: null });

  const payData = inv.kind === 'invoice' ? await paymentFormData({ clientId: inv.client_id }) : null;

  return (
    <InvoiceDetail
      inv={{
        id: inv.id, kind: inv.kind!, number: inv.number!, status: inv.status!, title: inv.title, client_id: inv.client_id!, client_name: inv.client_name ?? '',
        issue_date: inv.issue_date!, due_date: inv.due_date, currency: inv.currency!, total: num(inv.total), subtotal: num(inv.subtotal), tax_total: num(inv.tax_total),
        amount_paid: num(inv.amount_paid), balance: num(inv.balance), is_overdue: !!inv.is_overdue, days_overdue: num(inv.days_overdue), po_number: inv.po_number,
        project_name: inv.project_name, revision: inv.revision!, last_payment_on: inv.last_payment_on, last_reminded_at: inv.last_reminded_at,
        archived_pdf_path: inv.archived_pdf_path, updated_at: inv.updated_at!, sent_at: inv.sent_at, line_count: lines.count ?? 0, recurring_id: inv.recurring_id,
        fx_rate: num(inv.fx_rate),
      }}
      client={must(client)}
      payments={payments.map((p) => ({ id: p.id, received_on: p.received_on, amount: num(p.amount), applied: p.applied, currency: p.currency, method: p.method, reference: p.reference }))}
      revisions={revRows.sort((a, b) => b.revision - a.revision).map((r) => ({ revision: r.revision, reason: r.reason, created_at: r.created_at }))}
      events={events.reverse()}
      source={source.data}
      derived={must(derived)}
      schedule={schedule.data}
      business={{ name: profile.operating_name ?? profile.legal_name, paymentInstructions: profile.payment_instructions, etransferEmail: profile.etransfer_email, lockBefore: profile.lock_books_before }}
      me={{ firstName: me.full_name.split(' ')[0]! }}
      payData={payData}
      openPay={sp.pay === '1'}
      initialRev={sp.rev && /^\d+$/.test(sp.rev) ? Number(sp.rev) : null}
    />
  );
}
