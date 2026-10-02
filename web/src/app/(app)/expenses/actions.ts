'use server';
import { revalidatePath } from 'next/cache';
import { addDays, format, parseISO, isValid } from 'date-fns';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { fxRateFor, type FxQuote } from '@/components/expenses/server';
import { round2 } from '@/components/expenses/math';
import type { ActionResult, ExpenseNature } from '@/lib/types';

export type ExpenseInput = {
  spent_on: string;
  vendor: string;
  description?: string | null;
  category_id?: string | null;
  project_id?: string | null;
  spent_by: string;
  paid_from_account_id: string;
  nature: ExpenseNature;
  business_pct: number;
  currency: 'CAD' | 'USD';
  total: number;
  gst_hst: number;
  pst: number;
  fx_rate?: number | null;
  billable: boolean;
  tags: string[];
  notes?: string | null;
  source?: 'manual' | 'receipt_scan';
};

function revalidateAll(id?: string) {
  revalidatePath('/expenses');
  if (id) revalidatePath(`/expenses/${id}`);
  revalidatePath('/balances');
  revalidatePath('/subscriptions');
  revalidatePath('/');
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));

async function lockError(...dates: (string | null | undefined)[]) {
  const profile = await businessProfile();
  const lock = profile.lock_books_before;
  if (!lock) return null;
  const hit = dates.find((d) => d && d < lock);
  return hit ? `The books are closed before ${format(parseISO(lock), 'MMM d, yyyy')}. Change the lock date in Settings to edit this period.` : null;
}

async function validate(input: ExpenseInput): Promise<string | Omit<ExpenseInput, 'source'> & { subtotal: number; fx_rate: number }> {
  const vendor = input.vendor?.trim();
  if (!vendor) return 'Add who you paid.';
  if (!isDate(input.spent_on)) return 'Pick a valid date.';
  const total = round2(Number(input.total));
  if (!(total > 0)) return 'Enter the amount you paid.';
  if (total > 10_000_000) return 'That amount looks too large.';
  if (!['CAD', 'USD'].includes(input.currency)) return 'Currency must be CAD or USD.';
  if (!['business', 'personal', 'mixed'].includes(input.nature)) return 'Choose what it was for.';
  let pct = Math.round(Number(input.business_pct));
  if (input.nature === 'business') pct = 100;
  if (input.nature === 'personal') pct = 0;
  if (input.nature === 'mixed' && !(pct >= 1 && pct <= 99)) return 'Mixed expenses need a business share between 1% and 99%.';
  const gst = round2(Number(input.gst_hst) || 0);
  const pst = round2(Number(input.pst) || 0);
  if (gst < 0 || pst < 0) return 'Taxes can’t be negative.';
  if (gst + pst > total) return 'Taxes are more than the total.';
  const supabase = await db();
  const [acct, member] = await Promise.all([
    supabase.from('money_accounts').select('id, kind, owner_member_id').eq('id', input.paid_from_account_id).maybeSingle(),
    supabase.from('members').select('id').eq('id', input.spent_by).maybeSingle(),
  ]);
  if (!acct.data) return 'Choose how it was paid.';
  if (!member.data) return 'Choose who spent it.';
  if (acct.data.kind === 'personal' && acct.data.owner_member_id && acct.data.owner_member_id !== input.spent_by) return 'That personal account belongs to the other owner.';
  let fx = 1;
  if (input.currency !== 'CAD') {
    fx = Number(input.fx_rate) > 0 ? Number(input.fx_rate) : (await fxRateFor(input.currency, input.spent_on)).rate;
    if (!(fx > 0 && fx < 10)) return 'The exchange rate looks wrong.';
  }
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  return {
    spent_on: input.spent_on, vendor, description: input.description?.trim() || null, category_id: input.category_id || null,
    project_id: input.project_id || null, spent_by: input.spent_by, paid_from_account_id: input.paid_from_account_id,
    nature: input.nature, business_pct: pct, currency: input.currency, total, gst_hst: gst, pst, subtotal: round2(total - gst - pst),
    fx_rate: Math.round(fx * 1e6) / 1e6, billable: !!input.billable, tags, notes: input.notes?.trim() || null,
  };
}

export async function getFxRate(currency: string, date: string): Promise<ActionResult<FxQuote>> {
  await currentMember();
  if (currency !== 'USD' && currency !== 'CAD') return { ok: false, error: 'Unsupported currency' };
  if (!isDate(date)) return { ok: false, error: 'Invalid date' };
  try {
    return { ok: true, data: await fxRateFor(currency, date) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DuplicateHit = { id: string; vendor: string; spent_on: string; total: number; currency: string; spent_by_name: string | null };

/** Same vendor and amount within ±3 days. */
export async function findDuplicates(vendor: string, total: number, date: string, excludeId?: string): Promise<ActionResult<DuplicateHit[]>> {
  await currentMember();
  if (!vendor.trim() || !(total > 0) || !isDate(date)) return { ok: true, data: [] };
  const supabase = await db();
  const d = parseISO(date);
  let q = supabase.from('expense_overview').select('id, vendor, spent_on, total, currency, spent_by_name')
    .ilike('vendor', vendor.trim().replace(/[%_]/g, '')).eq('total', round2(total))
    .gte('spent_on', format(addDays(d, -3), 'yyyy-MM-dd')).lte('spent_on', format(addDays(d, 3), 'yyyy-MM-dd')).limit(3);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id!, vendor: r.vendor!, spent_on: r.spent_on!, total: Number(r.total), currency: r.currency!, spent_by_name: r.spent_by_name })) };
}

export async function createExpense(input: ExpenseInput): Promise<ActionResult<{ id: string }>> {
  const me = await currentMember();
  try {
    const v = await validate(input);
    if (typeof v === 'string') return { ok: false, error: v };
    const locked = await lockError(v.spent_on);
    if (locked) return { ok: false, error: locked };
    const supabase = await db();
    const row = must(await supabase.from('expenses').insert({ ...v, source: input.source === 'receipt_scan' ? 'receipt_scan' : 'manual', created_by: me.id }).select('id').single());
    revalidateAll(row.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  try {
    const supabase = await db();
    const existing = must(await supabase.from('expenses').select('spent_on').eq('id', id).maybeSingle());
    if (!existing) return { ok: false, error: 'This expense no longer exists.' };
    const v = await validate(input);
    if (typeof v === 'string') return { ok: false, error: v };
    const locked = await lockError(existing.spent_on, v.spent_on);
    if (locked) return { ok: false, error: locked };
    must(await supabase.from('expenses').update(v).eq('id', id).select('id'));
    revalidateAll(id);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    const existing = must(await supabase.from('expenses').select('spent_on, bank_transaction_id').eq('id', id).maybeSingle());
    if (!existing) return { ok: true };
    const locked = await lockError(existing.spent_on);
    if (locked) return { ok: false, error: locked };
    const files = must(await supabase.from('attachments').select('id, storage_path').eq('entity_type', 'expense').eq('entity_id', id));
    if (files.length) {
      await supabase.storage.from('accounts').remove(files.map((f) => f.storage_path));
      must(await supabase.from('attachments').delete().in('id', files.map((f) => f.id)).select('id'));
    }
    // A bank line matched to this expense goes back to the review queue.
    await supabase.from('bank_transactions').update({ status: 'unreviewed', matched_expense_id: null }).eq('matched_expense_id', id);
    must(await supabase.from('expenses').delete().eq('id', id).select('id'));
    revalidateAll();
    revalidatePath('/banking');
    revalidatePath('/banking/review');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Flip the settled flag on its own (no money moves — use Settle up on Owner balances for that). */
export async function setExpenseSettled(id: string, settled: boolean): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    must(await supabase.from('expenses').update({ settled, settled_on: settled ? format(new Date(), 'yyyy-MM-dd') : null, ...(settled ? {} : { settlement_transfer_id: null }) }).eq('id', id).select('id'));
    revalidateAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
