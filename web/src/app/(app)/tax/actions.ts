'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isoToday } from '@/lib/format';
import type { ActionResult, Row } from '@/lib/types';
import type { Json } from '@/lib/database.types';

const KINDS = ['gst', 't2', 't4', 't5', 'other'] as const;
const DOC_FOR: Record<string, string> = { gst: 'gst_return', t2: 't2_return' };
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const optDate = (s: unknown) => (s === '' || s == null ? null : isDate(s) ? s : undefined);
const optMoney = (v: unknown) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

function revalidateTax() {
  revalidatePath('/tax', 'layout');
  revalidatePath('/documents');
  revalidatePath('/');
}

export type FilingInput = { id?: string; kind: string; period_start: string; period_end: string; due_on?: string | null; notes?: string | null };

export async function saveFiling(input: FilingInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  if (!KINDS.includes(input.kind as (typeof KINDS)[number])) return { ok: false, error: 'Choose what kind of filing this is.' };
  if (!isDate(input.period_start) || !isDate(input.period_end)) return { ok: false, error: 'Enter the start and end of the period.' };
  if (input.period_start > input.period_end) return { ok: false, error: 'The period ends before it starts.' };
  const due = optDate(input.due_on);
  if (due === undefined) return { ok: false, error: 'The due date isn’t a valid date.' };
  const row = { kind: input.kind, period_start: input.period_start, period_end: input.period_end, due_on: due, notes: input.notes?.trim() || null };
  const supabase = await db();
  const res = input.id
    ? await supabase.from('tax_filings').update(row).eq('id', input.id).select('id').single()
    : await supabase.from('tax_filings').insert(row).select('id').single();
  if (res.error) {
    return { ok: false, error: res.error.code === '23505' ? 'A filing of this kind already exists for that period.' : res.error.message };
  }
  revalidateTax();
  return { ok: true, data: { id: res.data.id } };
}

export type MarkFiledInput = {
  id: string; filed_on: string; confirmation?: string | null; amount_owing?: string | number | null; paid_on?: string | null;
  /** Create a vault document for the filed return (the client uploads the file to it). */
  attach?: { title: string; fiscal_year: number | null } | null;
};

export async function markFiled(input: MarkFiledInput): Promise<ActionResult<{ documentId: string | null }>> {
  const me = await currentMember();
  if (!isDate(input.filed_on)) return { ok: false, error: 'Enter the date you filed.' };
  if (input.filed_on > isoToday()) return { ok: false, error: 'The filed date can’t be in the future.' };
  const paid = optDate(input.paid_on);
  if (paid === undefined) return { ok: false, error: 'The paid date isn’t a valid date.' };
  const amount = optMoney(input.amount_owing);
  if (amount === undefined) return { ok: false, error: 'Enter the amount as a number, e.g. 2,450.18 (negative for a refund).' };
  const supabase = await db();
  const { data: filing, error } = await supabase.from('tax_filings').select('*').eq('id', input.id).single();
  if (error || !filing) return { ok: false, error: 'That filing no longer exists.' };

  let documentId: string | null = filing.document_id;
  if (input.attach?.title?.trim()) {
    const doc = await supabase.from('documents').insert({
      title: input.attach.title.trim(), doc_type: DOC_FOR[filing.kind] ?? 'other', fiscal_year: input.attach.fiscal_year,
      issued_on: input.filed_on, period_start: filing.period_start, period_end: filing.period_end,
      notes: input.confirmation ? `Confirmation ${input.confirmation}` : null,
    }).select('id').single();
    if (doc.error) return { ok: false, error: doc.error.message };
    documentId = doc.data.id;
  }
  const upd = await supabase.from('tax_filings').update({
    filed_on: input.filed_on, confirmation: input.confirmation?.trim() || null, amount_owing: amount, paid_on: paid, document_id: documentId, filed_by: me.id,
  }).eq('id', input.id).select('id').single();
  if (upd.error) return { ok: false, error: upd.error.message };
  revalidateTax();
  return { ok: true, data: { documentId: input.attach?.title ? documentId : null } };
}

/** Undo "mark as filed" (keeps any document that was created). */
export async function clearFiled(id: string, previous?: Pick<Row<'tax_filings'>, 'filed_on' | 'confirmation' | 'amount_owing' | 'paid_on'>): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  const res = await supabase.from('tax_filings').update(previous ?? { filed_on: null, confirmation: null, paid_on: null }).eq('id', id).select('id').single();
  if (res.error) return { ok: false, error: res.error.message };
  revalidateTax();
  return { ok: true };
}

export async function deleteFiling(id: string): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  const res = await supabase.from('tax_filings').delete().eq('id', id).select('id');
  if (res.error) return { ok: false, error: res.error.message };
  revalidateTax();
  return { ok: true };
}

/** Find (or create) the filing for a period so worksheet values and reviews have somewhere to live. */
async function ensureFiling(kind: 'gst' | 't2', start: string, end: string, due: string | null) {
  const supabase = await db();
  const found = await supabase.from('tax_filings').select('*').eq('kind', kind).eq('period_start', start).eq('period_end', end).maybeSingle();
  if (found.data) return found.data;
  const created = await supabase.from('tax_filings').insert({ kind, period_start: start, period_end: end, due_on: due }).select('*').single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

const WS_KEYS = ['l104', 'l107', 'l110', 'l111', 'l205', 'l405'] as const;

export async function saveWorksheet(input: { period_start: string; period_end: string; due_on: string | null; values: Record<string, string | number | null> }): Promise<ActionResult> {
  await currentMember();
  if (!isDate(input.period_start) || !isDate(input.period_end)) return { ok: false, error: 'Invalid period.' };
  const values: Record<string, number> = {};
  for (const k of WS_KEYS) {
    const v = optMoney(input.values[k]);
    if (v === undefined) return { ok: false, error: `Line ${k.slice(1)} needs a number.` };
    if (v !== null && v !== 0) values[k] = v;
  }
  try {
    const f = await ensureFiling('gst', input.period_start, input.period_end, input.due_on);
    if (f.filed_on) return { ok: false, error: 'This return is marked as filed. Undo that first to change it.' };
    const ws = { ...((f.worksheet ?? {}) as Record<string, Json>) };
    for (const k of WS_KEYS) delete ws[k];
    const supabase = await db();
    const res = await supabase.from('tax_filings').update({ worksheet: { ...ws, ...values } }).eq('id', f.id).select('id').single();
    if (res.error) return { ok: false, error: res.error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateTax();
  return { ok: true };
}

export async function setReview(input: { period_start: string; period_end: string; due_on: string | null; key: 'owner_balances' | 'capital_assets'; reviewed: boolean }): Promise<ActionResult> {
  const me = await currentMember();
  if (!['owner_balances', 'capital_assets'].includes(input.key)) return { ok: false, error: 'Unknown review.' };
  if (!isDate(input.period_start) || !isDate(input.period_end)) return { ok: false, error: 'Invalid period.' };
  try {
    const f = await ensureFiling('t2', input.period_start, input.period_end, input.due_on);
    const ws = { ...((f.worksheet ?? {}) as Record<string, Json>) };
    const reviews = { ...((ws.reviews ?? {}) as Record<string, Json>) };
    if (input.reviewed) reviews[input.key] = { on: isoToday(), by: me.full_name };
    else delete reviews[input.key];
    const supabase = await db();
    const res = await supabase.from('tax_filings').update({ worksheet: { ...ws, reviews } }).eq('id', f.id).select('id').single();
    if (res.error) return { ok: false, error: res.error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidateTax();
  return { ok: true };
}
