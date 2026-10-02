'use server';
import { revalidatePath } from 'next/cache';
import { addDays, addMonths, addYears, format, parseISO, isValid } from 'date-fns';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { fxRateFor } from '@/components/expenses/server';
import { round2 } from '@/components/expenses/math';
import type { ActionResult, ExpenseNature } from '@/lib/types';

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionInput = {
  vendor: string; description?: string | null; category_id?: string | null; spent_by: string; paid_from_account_id: string;
  nature: ExpenseNature; business_pct: number; currency: 'CAD' | 'USD'; amount: number; gst_hst: number; pst: number;
  frequency: Frequency; next_on: string; active: boolean; project_id?: string | null; notes?: string | null;
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));

function advance(on: string, f: Frequency) {
  const d = parseISO(on);
  const next = f === 'weekly' ? addDays(d, 7) : f === 'monthly' ? addMonths(d, 1) : f === 'quarterly' ? addMonths(d, 3) : addYears(d, 1);
  return format(next, 'yyyy-MM-dd');
}

function revalidateAll() {
  for (const p of ['/subscriptions', '/expenses', '/balances', '/']) revalidatePath(p);
}

function clean(input: SubscriptionInput): string | SubscriptionInput {
  if (!input.vendor?.trim()) return 'Add the vendor.';
  const amount = round2(Number(input.amount));
  if (!(amount > 0)) return 'Enter the charge amount.';
  if (!['CAD', 'USD'].includes(input.currency)) return 'Currency must be CAD or USD.';
  if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(input.frequency)) return 'Choose how often it charges.';
  if (!isDate(input.next_on)) return 'Pick the next charge date.';
  let pct = Math.round(Number(input.business_pct));
  if (input.nature === 'business') pct = 100;
  if (input.nature === 'personal') pct = 0;
  if (input.nature === 'mixed' && !(pct >= 1 && pct <= 99)) return 'Mixed needs a business share between 1% and 99%.';
  const gst = round2(Number(input.gst_hst) || 0), pst = round2(Number(input.pst) || 0);
  if (gst < 0 || pst < 0 || gst + pst > amount) return 'Check the tax amounts.';
  return {
    ...input, vendor: input.vendor.trim(), description: input.description?.trim() || null, category_id: input.category_id || null,
    project_id: input.project_id || null, notes: input.notes?.trim() || null, amount, gst_hst: gst, pst, business_pct: pct, active: !!input.active,
  };
}

export async function saveSubscription(id: string | null, input: SubscriptionInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  try {
    const v = clean(input);
    if (typeof v === 'string') return { ok: false, error: v };
    const supabase = await db();
    const row = id
      ? must(await supabase.from('recurring_expenses').update(v).eq('id', id).select('id').single())
      : must(await supabase.from('recurring_expenses').insert(v).select('id').single());
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setSubscriptionActive(id: string, active: boolean): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    must(await supabase.from('recurring_expenses').update({ active }).eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteSubscription(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    must(await supabase.from('recurring_expenses').delete().eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Log one charge as an expense (source = recurring), roll the next charge
 * date forward and remember a new price if it changed.
 */
export async function logSubscriptionCharge(id: string, input: { date: string; amount: number }): Promise<ActionResult<{ expenseId: string; nextOn: string; priceChanged: boolean }>> {
  const me = await currentMember();
  try {
    if (!isDate(input.date)) return { ok: false, error: 'Pick the charge date.' };
    const amount = round2(Number(input.amount));
    if (!(amount > 0)) return { ok: false, error: 'Enter the amount charged.' };
    const profile = await businessProfile();
    if (profile.lock_books_before && input.date < profile.lock_books_before) return { ok: false, error: `The books are closed before ${profile.lock_books_before}.` };
    const supabase = await db();
    const sub = must(await supabase.from('recurring_expenses').select('*').eq('id', id).maybeSingle());
    if (!sub) return { ok: false, error: 'That subscription no longer exists.' };

    const base = Number(sub.amount);
    const ratio = base > 0 ? amount / base : 1;
    const gst = round2(Number(sub.gst_hst) * ratio);
    const pst = round2(Number(sub.pst) * ratio);
    const fx = sub.currency === 'CAD' ? 1 : (await fxRateFor(sub.currency, input.date)).rate;
    const exp = must(await supabase.from('expenses').insert({
      spent_on: input.date, vendor: sub.vendor, description: sub.description, category_id: sub.category_id, project_id: sub.project_id,
      spent_by: sub.spent_by, paid_from_account_id: sub.paid_from_account_id, nature: sub.nature, business_pct: sub.business_pct,
      currency: sub.currency, total: amount, gst_hst: gst, pst, subtotal: round2(amount - gst - pst), fx_rate: Math.round(fx * 1e6) / 1e6,
      source: 'recurring', recurring_expense_id: sub.id, tags: ['subscription'], created_by: me.id,
    }).select('id').single());

    // This charge covers the period starting at next_on (even if it posts a day early).
    let next = advance(sub.next_on, sub.frequency as Frequency);
    while (next <= input.date) next = advance(next, sub.frequency as Frequency);
    const priceChanged = Math.abs(amount - base) >= 0.01;
    must(await supabase.from('recurring_expenses').update({ next_on: next, ...(priceChanged ? { amount, gst_hst: gst, pst } : {}) }).eq('id', id).select('id'));
    revalidateAll();
    return { ok: true, data: { expenseId: exp.id, nextOn: next, priceChanged } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Undo a logged charge: remove the expense and put the schedule back. */
export async function undoLogCharge(id: string, expenseId: string, prev: { next_on: string; amount: number; gst_hst: number; pst: number }): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    must(await supabase.from('expenses').delete().eq('id', expenseId).eq('recurring_expense_id', id).select('id'));
    must(await supabase.from('recurring_expenses').update({ next_on: prev.next_on, amount: prev.amount, gst_hst: prev.gst_hst, pst: prev.pst }).eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
