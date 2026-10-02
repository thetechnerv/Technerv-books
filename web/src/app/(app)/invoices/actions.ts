'use server';
import { revalidatePath } from 'next/cache';
import { addDays, format, parseISO, isValid } from 'date-fns';
import { db, must, type Db } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { latestRate } from '@/lib/finance';
import { date, isoToday } from '@/lib/format';
import type { ActionResult, InvoiceKind, InvoiceStatus, Row } from '@/lib/types';
import type { Json } from '@/lib/database.types';
import { bumpMonthNames, KIND_LABEL, nextRun } from '@/components/invoices/shared';
import { invoicePdfModel } from '@/components/pdf/load';
import { renderInvoicePdf } from '@/components/pdf/render';
import { putServerFile } from '@/lib/storage';

export type LineInput = {
  item_id?: string | null;
  description: string;
  detail?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  tax_rate_id?: string | null;
};

export type InvoiceInput = {
  id?: string | null;
  kind: InvoiceKind;
  client_id: string;
  project_id?: string | null;
  title?: string | null;
  po_number?: string | null;
  issue_date: string;
  due_date?: string | null;
  discount?: number | null;
  notes?: string | null;
  terms?: string | null;
  lines: LineInput[];
  /** Save and mark as sent (or issued, for credit notes). */
  send?: boolean;
  /** Required when changing an invoice that has already been sent. */
  reason?: string | null;
  converted_from?: string | null;
  recurring_id?: string | null;
  /** Billable expenses this new invoice re-bills; they're marked billed on save. */
  bill_expense_ids?: string[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
const clean = (s: string | null | undefined, max = 2000) => {
  const v = (s ?? '').trim();
  return v ? v.slice(0, max) : null;
};
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function lockError(profile: Row<'business_profile'>, ...dates: (string | null | undefined)[]) {
  const lock = profile.lock_books_before;
  if (!lock) return null;
  const bad = dates.find((d) => d && d < lock);
  return bad ? `The books are closed before ${date(lock)}. Documents dated ${date(bad)} can’t be changed — reopen the period in Settings first.` : null;
}

async function log(supabase: Db, memberId: string, entityId: string, action: string, summary: string) {
  await supabase.from('activity_log').insert({ member_id: memberId, entity_type: 'invoices', entity_id: entityId, action, summary });
}

async function fxFor(supabase: Db, currency: string, on: string) {
  if (currency === 'CAD') return 1;
  const r = must(await supabase.from('fx_rates').select('rate_to_cad').eq('currency', currency).lte('rate_date', on).order('rate_date', { ascending: false }).limit(1).maybeSingle());
  return r ? Number(r.rate_to_cad) : latestRate(currency);
}

function revalidateAll(id?: string) {
  revalidatePath('/', 'layout');
  if (id) revalidatePath(`/invoices/${id}`);
}

function validLines(lines: LineInput[]): { ok: true; lines: LineInput[] } | { ok: false; error: string } {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: 'Add at least one line item.' };
  if (lines.length > 200) return { ok: false, error: 'That’s more than 200 lines — split it into two invoices.' };
  const out: LineInput[] = [];
  for (const [i, l] of lines.entries()) {
    const description = clean(l.description, 500);
    if (!description) return { ok: false, error: `Line ${i + 1} needs a description.` };
    const quantity = Number(l.quantity);
    const unit_price = Number(l.unit_price);
    if (!Number.isFinite(quantity) || Math.abs(quantity) > 1e7) return { ok: false, error: `Line ${i + 1}: check the quantity.` };
    if (!Number.isFinite(unit_price) || Math.abs(unit_price) > 1e9) return { ok: false, error: `Line ${i + 1}: check the price.` };
    if (l.tax_rate_id && !UUID.test(l.tax_rate_id)) return { ok: false, error: `Line ${i + 1}: unknown tax rate.` };
    if (l.item_id && !UUID.test(l.item_id)) return { ok: false, error: `Line ${i + 1}: unknown item.` };
    out.push({
      item_id: l.item_id || null, description, detail: clean(l.detail, 500), quantity: Math.round(quantity * 1000) / 1000,
      unit: clean(l.unit, 30), unit_price: Math.round(unit_price * 100) / 100, tax_rate_id: l.tax_rate_id || null,
    });
  }
  return { ok: true, lines: out };
}

async function snapshotRevision(supabase: Db, invoiceId: string, revision: number, reason: string | null, createdBy: string | null, createdAt?: string | null) {
  const snap = must(await supabase.rpc('invoice_snapshot', { p_invoice: invoiceId }));
  const { error } = await supabase.from('invoice_revisions').insert({
    invoice_id: invoiceId, revision, reason, snapshot: snap as Json, created_by: createdBy, ...(createdAt ? { created_at: createdAt } : {}),
  });
  // A snapshot for this revision may already exist (e.g. the sample data) — that one wins.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

/** Create or update an invoice, estimate or credit note. */
export async function saveInvoice(input: InvoiceInput): Promise<ActionResult<{ id: string; number: string }>> {
  const me = await currentMember();
  const supabase = await db();
  const profile = await businessProfile();
  try {
    if (!['invoice', 'estimate', 'credit_note'].includes(input.kind)) return fail('Unknown document type.');
    if (!input.client_id || !UUID.test(input.client_id)) return fail('Choose a client.');
    if (!isIso(input.issue_date)) return fail('Choose an issue date.');
    if (input.due_date && !isIso(input.due_date)) return fail('Check the due date.');
    if (input.due_date && input.due_date < input.issue_date) return fail(input.kind === 'estimate' ? 'Valid-until can’t be before the issue date.' : 'The due date can’t be before the issue date.');
    if (input.project_id && !UUID.test(input.project_id)) return fail('Unknown project.');
    const v = validLines(input.lines);
    if (!v.ok) return fail(v.error);
    const discount = Math.max(0, Math.round(Number(input.discount ?? 0) * 100) / 100);
    if (!Number.isFinite(discount)) return fail('Check the discount.');

    const client = must(await supabase.from('clients').select('id, currency, display_name').eq('id', input.client_id).maybeSingle());
    if (!client) return fail('That client no longer exists.');
    if (input.project_id) {
      const p = must(await supabase.from('projects').select('client_id').eq('id', input.project_id).maybeSingle());
      if (!p || (p.client_id && p.client_id !== client.id)) return fail('That project belongs to a different client.');
    }

    const fields = {
      client_id: client.id,
      project_id: input.project_id || null,
      title: clean(input.title, 200),
      po_number: clean(input.po_number, 60),
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      discount,
      notes: clean(input.notes),
      terms: clean(input.terms),
    };
    const lines = v.lines.map((l, i) => ({ ...l, sort: i }));

    // ───── Update ─────
    if (input.id) {
      if (!UUID.test(input.id)) return fail('Unknown document.');
      const cur = must(await supabase.from('invoices').select('*').eq('id', input.id).maybeSingle());
      if (!cur) return fail('This document was deleted.');
      if (cur.status === 'void') return fail('Void documents can’t be edited. Duplicate it instead.');
      const locked = lockError(profile, cur.issue_date, input.issue_date);
      if (locked) return fail(locked);
      const issued = cur.status !== 'draft';
      if (issued && cur.amount_paid > 0 && client.currency !== cur.currency) return fail('This invoice has payments, so its currency can’t change.');
      const fx = client.currency === cur.currency && cur.issue_date === input.issue_date ? cur.fx_rate : await fxFor(supabase, client.currency, input.issue_date);

      if (issued) {
        const reason = clean(input.reason, 300);
        if (!reason || reason.length < 3) return fail('Add a short reason for changing an issued document.');
        // Keep the version the client already has, so its PDF can be reproduced.
        await snapshotRevision(supabase, cur.id, cur.revision, cur.revision === 1 ? 'Original issue' : null, cur.created_by, cur.sent_at ?? cur.created_at);
        must(await supabase.from('invoices').update({ ...fields, currency: client.currency, fx_rate: fx, revision: cur.revision + 1 }).eq('id', cur.id).select('id'));
        must(await supabase.rpc('replace_invoice_lines', { p_invoice: cur.id, p_lines: lines as unknown as Json }));
        await supabase.rpc('recalc_invoice_paid', { p_invoice: cur.id });
        await snapshotRevision(supabase, cur.id, cur.revision + 1, reason, me.id);
        await log(supabase, me.id, cur.id, 'revised', `${cur.number} (rev. ${cur.revision + 1})`);
      } else {
        const sendNow = !!input.send;
        must(await supabase.from('invoices').update({
          ...fields, currency: client.currency, fx_rate: fx,
          ...(sendNow ? { status: 'sent' as InvoiceStatus, sent_at: new Date().toISOString() } : {}),
        }).eq('id', cur.id).select('id'));
        must(await supabase.rpc('replace_invoice_lines', { p_invoice: cur.id, p_lines: lines as unknown as Json }));
        if (sendNow) await log(supabase, me.id, cur.id, 'sent', cur.number);
      }
      revalidateAll(cur.id);
      return { ok: true, data: { id: cur.id, number: cur.number }, message: issued ? `Saved revision ${cur.revision + 1}` : 'Saved' };
    }

    // ───── Create ─────
    const locked = lockError(profile, input.issue_date);
    if (locked) return fail(locked);
    if (input.converted_from && !UUID.test(input.converted_from)) return fail('Unknown source document.');
    if (input.recurring_id && !UUID.test(input.recurring_id)) return fail('Unknown schedule.');
    const number = must(await supabase.rpc('next_document_number', { p_kind: input.kind }));
    const fx = await fxFor(supabase, client.currency, input.issue_date);
    const send = !!input.send;
    const inv = must(await supabase.from('invoices').insert({
      ...fields, kind: input.kind, number, currency: client.currency, fx_rate: fx,
      status: send ? 'sent' : 'draft', sent_at: send ? new Date().toISOString() : null,
      converted_from: input.converted_from || null, recurring_id: input.recurring_id || null, created_by: me.id,
    }).select('id, number').single());
    const linesRes = await supabase.rpc('replace_invoice_lines', { p_invoice: inv.id, p_lines: lines as unknown as Json });
    if (linesRes.error) {
      // Don't leave an empty header behind (the number stays used, which is fine for a draft).
      await supabase.from('invoices').delete().eq('id', inv.id);
      return fail(linesRes.error.message);
    }
    const billIds = (input.bill_expense_ids ?? []).filter((x) => UUID.test(x)).slice(0, 200);
    if (billIds.length) {
      must(await supabase.from('expenses').update({ billed_invoice_id: inv.id }).in('id', billIds).is('billed_invoice_id', null).select('id'));
    }
    if (send) await log(supabase, me.id, inv.id, 'sent', inv.number);
    revalidateAll(inv.id);
    return { ok: true, data: { id: inv.id, number: inv.number }, message: `${KIND_LABEL[input.kind]} ${inv.number} ${send ? (input.kind === 'credit_note' ? 'issued' : 'saved and marked sent') : 'saved as draft'}` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

type StatusAction = 'sent' | 'draft' | 'accepted' | 'declined' | 'void' | 'applied';

/** Status transitions from the detail screen. */
export async function setInvoiceStatus(id: string, to: StatusAction): Promise<ActionResult> {
  const me = await currentMember();
  const supabase = await db();
  const profile = await businessProfile();
  try {
    if (!UUID.test(id)) return fail('Unknown document.');
    const cur = must(await supabase.from('invoices').select('*').eq('id', id).maybeSingle());
    if (!cur) return fail('This document was deleted.');
    const locked = lockError(profile, cur.issue_date);
    if (locked) return fail(locked);

    let patch: Partial<Row<'invoices'>> = {};
    let verb = '';
    switch (to) {
      case 'sent':
        if (!['draft', 'accepted', 'declined'].includes(cur.status)) return fail('Already sent.');
        patch = { status: 'sent', sent_at: cur.sent_at ?? new Date().toISOString() };
        verb = 'sent';
        break;
      case 'draft':
        if (cur.amount_paid > 0) return fail('This invoice has payments. Delete them first.');
        if (cur.status === 'void') return fail('Void documents stay void.');
        patch = { status: 'draft', sent_at: null };
        verb = 'moved to draft';
        break;
      case 'accepted':
      case 'declined':
        if (cur.kind !== 'estimate') return fail('Only estimates can be accepted or declined.');
        patch = { status: to, sent_at: cur.sent_at ?? new Date().toISOString() };
        verb = to;
        break;
      case 'applied':
        if (cur.kind !== 'credit_note') return fail('Only credit notes can be applied.');
        patch = { status: 'paid' };
        verb = 'applied';
        break;
      case 'void':
        if (cur.amount_paid > 0) return fail('This invoice has payments. Delete or move them before voiding.');
        patch = { status: 'void' };
        verb = 'voided';
        break;
      default:
        return fail('Unknown action.');
    }
    must(await supabase.from('invoices').update(patch).eq('id', id).select('id'));
    await log(supabase, me.id, id, verb, cur.number);
    revalidateAll(id);
    return { ok: true };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Drafts only — anything that was sent must be voided instead, to keep the number trail. */
export async function deleteDraft(id: string): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  try {
    const cur = must(await supabase.from('invoices').select('status, number').eq('id', id).maybeSingle());
    if (!cur) return { ok: true };
    if (cur.status !== 'draft') return fail('Only drafts can be deleted. Void it instead.');
    const used = must(await supabase.from('invoices').select('id').eq('converted_from', id).limit(1));
    if (used.length) return fail('Another document was created from this draft.');
    await supabase.from('recurring_invoices').update({ template_invoice_id: null }).eq('template_invoice_id', id);
    await supabase.from('expenses').update({ billed_invoice_id: null }).eq('billed_invoice_id', id);
    must(await supabase.from('invoices').delete().eq('id', id).select('id'));
    revalidateAll();
    return { ok: true, message: `Deleted draft ${cur.number}` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

async function copyDocument(supabase: Db, me: Row<'members'>, src: Row<'invoices'>, kind: InvoiceKind, opts: { issueDate?: string; dueDate?: string | null; bumpMonth?: Date; recurringId?: string | null } = {}) {
  const profile = await businessProfile();
  const issue = opts.issueDate ?? isoToday();
  const client = must(await supabase.from('clients').select('terms_days, currency').eq('id', src.client_id).single());
  const days = kind === 'estimate' ? profile.estimate_valid_days : client.terms_days ?? profile.default_terms_days;
  const due = opts.dueDate !== undefined ? opts.dueDate : kind === 'credit_note' ? null : format(addDays(parseISO(issue), days), 'yyyy-MM-dd');
  const lines = must(await supabase.from('invoice_lines').select('*').eq('invoice_id', src.id).order('sort'));
  const number = must(await supabase.rpc('next_document_number', { p_kind: kind }));
  const bump = (t: string | null) => (opts.bumpMonth ? bumpMonthNames(t, opts.bumpMonth) : t);
  const inv = must(await supabase.from('invoices').insert({
    kind, number, client_id: src.client_id, project_id: src.project_id, status: 'draft', issue_date: issue, due_date: due,
    currency: client.currency, fx_rate: await fxFor(supabase, client.currency, issue), discount: src.discount,
    title: kind === 'credit_note' ? `Credit for ${src.number}` : bump(src.title), po_number: src.po_number,
    notes: kind === src.kind ? src.notes : null, terms: kind === src.kind ? src.terms : null,
    converted_from: kind !== src.kind ? src.id : null, recurring_id: opts.recurringId ?? null, created_by: me.id,
  }).select('id, number').single());
  must(await supabase.rpc('replace_invoice_lines', {
    p_invoice: inv.id,
    p_lines: lines.map((l) => ({ sort: l.sort, item_id: l.item_id, description: bump(l.description), detail: l.detail, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate_id: l.tax_rate_id })) as unknown as Json,
  }));
  return inv;
}

/** Estimate → draft invoice (marks the estimate accepted). */
export async function convertEstimate(id: string): Promise<ActionResult<{ id: string; number: string }>> {
  const me = await currentMember();
  const supabase = await db();
  try {
    const est = must(await supabase.from('invoices').select('*').eq('id', id).maybeSingle());
    if (!est || est.kind !== 'estimate') return fail('Only estimates can be converted.');
    if (est.status === 'declined') return fail('This estimate was declined. Mark it accepted first if the client changed their mind.');
    const inv = await copyDocument(supabase, me, est, 'invoice');
    if (est.status !== 'accepted') must(await supabase.from('invoices').update({ status: 'accepted', sent_at: est.sent_at ?? new Date().toISOString() }).eq('id', est.id).select('id'));
    await log(supabase, me.id, est.id, 'converted', `${est.number} → ${inv.number}`);
    revalidateAll(est.id);
    return { ok: true, data: inv, message: `Created draft ${inv.number}` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Polite reminder was copied to the clipboard — remember when. */
export async function markReminded(id: string): Promise<ActionResult> {
  const me = await currentMember();
  const supabase = await db();
  try {
    const inv = must(await supabase.from('invoices').update({ last_reminded_at: new Date().toISOString() }).eq('id', id).select('number').single());
    await log(supabase, me.id, id, 'reminded', inv.number);
    revalidateAll(id);
    return { ok: true };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Render the current PDF and keep it with the records: invoices/<year>/<number>-r<rev>.pdf */
export async function archivePdf(id: string): Promise<ActionResult<{ path: string }>> {
  const me = await currentMember();
  const supabase = await db();
  try {
    const model = await invoicePdfModel(id);
    if (!model) return fail('Document not found.');
    const pdf = await renderInvoicePdf(model);
    const path = `invoices/${model.issueDate.slice(0, 4)}/${model.number}-r${model.revision}.pdf`;
    await putServerFile(path, new Uint8Array(pdf), 'application/pdf');
    must(await supabase.from('invoices').update({ archived_pdf_path: path }).eq('id', id).select('id'));
    await log(supabase, me.id, id, 'saved PDF of', `${model.number} (rev. ${model.revision})`);
    revalidateAll(id);
    return { ok: true, data: { path }, message: 'PDF saved to records' };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ───────────────────────── Recurring ─────────────────────────

async function templateFor(supabase: Db, r: Row<'recurring_invoices'>) {
  if (r.template_invoice_id) {
    const t = must(await supabase.from('invoices').select('*').eq('id', r.template_invoice_id).maybeSingle());
    if (t && t.status !== 'void') return t;
  }
  const own = must(await supabase.from('invoices').select('*').eq('recurring_id', r.id).neq('status', 'void').order('issue_date', { ascending: false }).limit(1).maybeSingle());
  if (own) return own;
  return must(await supabase.from('invoices').select('*').eq('client_id', r.client_id).eq('kind', 'invoice').neq('status', 'void').order('issue_date', { ascending: false }).limit(1).maybeSingle());
}

async function runSchedule(supabase: Db, me: Row<'members'>, r: Row<'recurring_invoices'>) {
  const tpl = await templateFor(supabase, r);
  if (!tpl) throw new Error('No earlier invoice to copy for this client.');
  const inv = await copyDocument(supabase, me, tpl, 'invoice', { issueDate: r.next_run_on, bumpMonth: parseISO(r.next_run_on), recurringId: r.id });
  const next = nextRun(r.next_run_on, r.frequency);
  const ended = r.end_on && next > r.end_on;
  must(await supabase.from('recurring_invoices').update({ next_run_on: next, template_invoice_id: inv.id, ...(ended ? { active: false } : {}) }).eq('id', r.id).select('id'));
  return inv;
}

/** Generate drafts for every active schedule whose next run is today or earlier. */
export async function createDueDrafts(): Promise<ActionResult<{ created: string[] }>> {
  const me = await currentMember();
  const supabase = await db();
  try {
    const created: string[] = [];
    // Loop so a schedule that's several periods behind catches up, one draft per period.
    for (let guard = 0; guard < 60; guard++) {
      const due = must(await supabase.from('recurring_invoices').select('*').eq('active', true).lte('next_run_on', isoToday()).order('next_run_on'));
      const todo = due.filter((r) => !r.end_on || r.next_run_on <= r.end_on);
      if (!todo.length) break;
      for (const r of todo) created.push((await runSchedule(supabase, me, r)).number);
    }
    revalidateAll();
    return { ok: true, data: { created }, message: created.length ? `Created ${created.length} draft${created.length === 1 ? '' : 's'}: ${created.join(', ')}` : 'Nothing is due yet' };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Generate the next draft for one schedule now, ahead of its date. */
export async function runScheduleNow(id: string): Promise<ActionResult<{ id: string; number: string }>> {
  const me = await currentMember();
  const supabase = await db();
  try {
    const r = must(await supabase.from('recurring_invoices').select('*').eq('id', id).maybeSingle());
    if (!r) return fail('Schedule not found.');
    const inv = await runSchedule(supabase, me, r);
    revalidateAll();
    return { ok: true, data: inv, message: `Created draft ${inv.number}` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function saveSchedule(input: { id?: string | null; client_id: string; template_invoice_id?: string | null; frequency: string; next_run_on: string; end_on?: string | null; active?: boolean }): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const supabase = await db();
  try {
    if (!UUID.test(input.client_id ?? '')) return fail('Choose a client.');
    if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(input.frequency)) return fail('Choose how often.');
    if (!isIso(input.next_run_on)) return fail('Choose the next date.');
    if (input.end_on && (!isIso(input.end_on) || input.end_on < input.next_run_on)) return fail('The end date must be after the next date.');
    const row = {
      client_id: input.client_id, template_invoice_id: input.template_invoice_id || null, frequency: input.frequency,
      next_run_on: input.next_run_on, end_on: input.end_on || null, active: input.active ?? true,
    };
    const saved = input.id
      ? must(await supabase.from('recurring_invoices').update(row).eq('id', input.id).select('id').single())
      : must(await supabase.from('recurring_invoices').insert(row).select('id').single());
    if (input.template_invoice_id) await supabase.from('invoices').update({ recurring_id: saved.id }).eq('id', input.template_invoice_id).is('recurring_id', null);
    revalidateAll();
    return { ok: true, data: saved, message: input.id ? 'Schedule updated' : 'Recurring schedule created' };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function setScheduleActive(id: string, active: boolean): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  try {
    must(await supabase.from('recurring_invoices').update({ active }).eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  try {
    must(await supabase.from('recurring_invoices').delete().eq('id', id).select('id'));
    revalidateAll();
    return { ok: true, message: 'Schedule deleted — its invoices are kept' };
  } catch (e) {
    return fail((e as Error).message);
  }
}
