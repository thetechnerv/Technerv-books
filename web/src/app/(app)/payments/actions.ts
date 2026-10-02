'use server';
import { revalidatePath } from 'next/cache';
import { isValid, parseISO } from 'date-fns';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { date } from '@/lib/format';
import type { ActionResult, PaymentMethod } from '@/lib/types';

export type PaymentInput = {
  id?: string | null;
  client_id: string;
  received_on: string;
  amount: number;
  fx_rate?: number | null;
  method: PaymentMethod;
  deposit_account_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  allocations: { invoice_id: string; amount: number }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS: PaymentMethod[] = ['etransfer', 'eft', 'wire', 'cheque', 'card', 'cash', 'stripe', 'other'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

export async function savePayment(input: PaymentInput): Promise<ActionResult<{ id: string }>> {
  const me = await currentMember();
  const supabase = await db();
  const profile = await businessProfile();
  try {
    if (!UUID.test(input.client_id ?? '')) return fail('Choose who paid.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.received_on) || !isValid(parseISO(input.received_on))) return fail('Choose the date it arrived.');
    const amount = r2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) return fail('Enter the amount received.');
    if (!METHODS.includes(input.method)) return fail('Choose how it was paid.');
    if (input.deposit_account_id && !UUID.test(input.deposit_account_id)) return fail('Unknown account.');
    const lock = profile.lock_books_before;

    const client = must(await supabase.from('clients').select('id, currency').eq('id', input.client_id).maybeSingle());
    if (!client) return fail('That client no longer exists.');
    const currency = client.currency;
    const fx = currency === 'CAD' ? 1 : Number(input.fx_rate);
    if (!Number.isFinite(fx) || fx <= 0 || fx > 100) return fail('Enter the exchange rate to CAD.');

    let existing: { received_on: string; allocations: Map<string, number> } | null = null;
    if (input.id) {
      if (!UUID.test(input.id)) return fail('Unknown payment.');
      const p = must(await supabase.from('payments').select('received_on, payment_allocations(invoice_id, amount)').eq('id', input.id).maybeSingle());
      if (!p) return fail('This payment was deleted.');
      existing = { received_on: p.received_on, allocations: new Map(p.payment_allocations.map((a) => [a.invoice_id, Number(a.amount)])) };
    }
    if (lock && (input.received_on < lock || (existing && existing.received_on < lock))) {
      return fail(`The books are closed before ${date(lock)}. Payments dated before then can’t be changed.`);
    }

    const allocs = (input.allocations ?? []).map((a) => ({ invoice_id: a.invoice_id, amount: r2(Number(a.amount)) })).filter((a) => a.amount > 0);
    if (allocs.some((a) => !UUID.test(a.invoice_id) || !Number.isFinite(a.amount))) return fail('Check the invoice amounts.');
    if (new Set(allocs.map((a) => a.invoice_id)).size !== allocs.length) return fail('An invoice is listed twice.');
    const applied = r2(allocs.reduce((s, a) => s + a.amount, 0));
    if (applied > amount + 0.001) return fail(`You’ve applied ${applied.toFixed(2)} but only ${amount.toFixed(2)} was received.`);
    if (allocs.length) {
      const invs = must(await supabase.from('invoices').select('id, number, client_id, currency, balance, status, kind').in('id', allocs.map((a) => a.invoice_id)));
      for (const a of allocs) {
        const inv = invs.find((i) => i.id === a.invoice_id);
        if (!inv || inv.kind !== 'invoice') return fail('One of the invoices no longer exists.');
        if (inv.client_id !== client.id) return fail(`${inv.number} belongs to another client.`);
        if (inv.currency !== currency) return fail(`${inv.number} is in ${inv.currency}; this payment is in ${currency}.`);
        if (inv.status === 'void') return fail(`${inv.number} is void.`);
        const available = r2(Number(inv.balance) + (existing?.allocations.get(inv.id) ?? 0));
        if (a.amount > available + 0.001) return fail(`${inv.number} only has ${available.toFixed(2)} left to pay.`);
      }
    }

    const row = {
      client_id: client.id, received_on: input.received_on, amount, currency, fx_rate: fx, method: input.method,
      deposit_account_id: input.deposit_account_id || null, reference: (input.reference ?? '').trim().slice(0, 120) || null,
      notes: (input.notes ?? '').trim().slice(0, 2000) || null,
    };
    let id = input.id ?? null;
    if (id) {
      must(await supabase.from('payments').update(row).eq('id', id).select('id'));
      must(await supabase.from('payment_allocations').delete().eq('payment_id', id).select('id'));
    } else {
      id = must(await supabase.from('payments').insert({ ...row, recorded_by: me.id }).select('id').single()).id;
    }
    if (allocs.length) must(await supabase.from('payment_allocations').insert(allocs.map((a) => ({ ...a, payment_id: id! }))).select('id'));
    revalidatePath('/', 'layout');
    const unapplied = r2(amount - applied);
    return { ok: true, data: { id }, message: input.id ? 'Payment updated' : unapplied > 0 && allocs.length ? `Payment recorded · ${unapplied.toFixed(2)} not applied` : 'Payment recorded' };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Deleting a payment re-opens the invoices it paid (triggers recompute their status). */
export async function deletePayment(id: string): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  const profile = await businessProfile();
  try {
    const p = must(await supabase.from('payments').select('received_on').eq('id', id).maybeSingle());
    if (!p) return { ok: true };
    if (profile.lock_books_before && p.received_on < profile.lock_books_before) return fail(`The books are closed before ${date(profile.lock_books_before)}.`);
    must(await supabase.from('payments').delete().eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Payment deleted' };
  } catch (e) {
    return fail((e as Error).message);
  }
}
