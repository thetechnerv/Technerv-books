'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { DOC_TYPES } from '@/components/documents/types';

export type DocumentInput = {
  title: string; doc_type: string; fiscal_year?: number | string | null; issued_on?: string | null; expires_on?: string | null; notes?: string | null;
  account_id?: string | null; period_start?: string | null; period_end?: string | null;
};

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

function clean(input: DocumentInput): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const title = input.title?.trim();
  if (!title) return { ok: false, error: 'Give the document a title.' };
  if (title.length > 200) return { ok: false, error: 'That title is too long.' };
  if (!DOC_TYPES.some((t) => t.value === input.doc_type)) return { ok: false, error: 'Choose a document type.' };
  const fyRaw = input.fiscal_year === '' || input.fiscal_year == null ? null : Number(input.fiscal_year);
  if (fyRaw !== null && (!Number.isInteger(fyRaw) || fyRaw < 2000 || fyRaw > 2100)) return { ok: false, error: 'Fiscal year should look like 2026.' };
  const dates: Record<string, string | null> = {};
  for (const k of ['issued_on', 'expires_on', 'period_start', 'period_end'] as const) {
    const v = input[k];
    if (v === '' || v == null) dates[k] = null;
    else if (isDate(v)) dates[k] = v;
    else return { ok: false, error: 'One of the dates isn’t valid.' };
  }
  if (dates.issued_on && dates.expires_on && dates.expires_on < dates.issued_on) return { ok: false, error: 'It expires before it was issued.' };
  if (dates.period_start && dates.period_end && dates.period_end < dates.period_start) return { ok: false, error: 'The statement period ends before it starts.' };
  const statement = input.doc_type === 'statement';
  const account = statement && input.account_id ? input.account_id : null;
  if (account && !isUuid(account)) return { ok: false, error: 'Choose the account this statement is for.' };
  return {
    ok: true,
    row: {
      title, doc_type: input.doc_type, fiscal_year: fyRaw, issued_on: dates.issued_on, expires_on: dates.expires_on, notes: input.notes?.trim() || null,
      account_id: account, period_start: statement ? dates.period_start : null, period_end: statement ? dates.period_end : null,
    },
  };
}

function refresh() {
  revalidatePath('/documents');
  revalidatePath('/tax', 'layout');
}

export async function createDocument(input: DocumentInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const c = clean(input);
  if (!c.ok) return c;
  const supabase = await db();
  const res = await supabase.from('documents').insert(c.row as never).select('id').single();
  if (res.error) return { ok: false, error: res.error.message };
  refresh();
  return { ok: true, data: { id: res.data.id } };
}

export async function updateDocument(id: string, input: DocumentInput): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id)) return { ok: false, error: 'Unknown document.' };
  const c = clean(input);
  if (!c.ok) return c;
  const supabase = await db();
  const res = await supabase.from('documents').update(c.row as never).eq('id', id).select('id').single();
  if (res.error) return { ok: false, error: res.error.message };
  refresh();
  return { ok: true };
}

/** Deletes the document, its stored files and attachment rows. Filings that pointed at it are unlinked. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id)) return { ok: false, error: 'Unknown document.' };
  const supabase = await db();
  const files = await supabase.from('attachments').select('id, storage_path').eq('entity_type', 'document').eq('entity_id', id);
  if (files.error) return { ok: false, error: files.error.message };
  if (files.data.length) {
    await supabase.storage.from('accounts').remove(files.data.map((f) => f.storage_path));
    const del = await supabase.from('attachments').delete().in('id', files.data.map((f) => f.id));
    if (del.error) return { ok: false, error: del.error.message };
  }
  const res = await supabase.from('documents').delete().eq('id', id).select('id');
  if (res.error) return { ok: false, error: res.error.message };
  refresh();
  return { ok: true };
}
