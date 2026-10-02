'use server';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { num, round2 } from '@/lib/format';
import type { ActionResult, ExpenseNature, PaymentMethod } from '@/lib/types';
import type { MatchKind } from '@/components/banking/types';
import { rateOn } from '../_lib/data';
import { findCounterpart, linkMatch, loadTxn, lockedError, recordTaken, reopenTxn, revalidateBanking } from '../_lib/review';

const KINDS: MatchKind[] = ['expense', 'payment', 'transfer', 'income'];
const NATURES: ExpenseNature[] = ['business', 'personal', 'mixed'];
const METHODS: PaymentMethod[] = ['etransfer', 'eft', 'wire', 'cheque', 'card', 'cash', 'stripe', 'other'];
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
}

/** Link a bank row to an existing expense, payment, owner transfer or income record. */
export async function matchTransaction(txnId: string, kind: MatchKind, recordId: string): Promise<ActionResult> {
  const me = await currentMember();
  try {
    if (!KINDS.includes(kind) || !isId(recordId)) return { ok: false, error: 'Choose a record to match.' };
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    if (await recordTaken(supabase, kind, recordId)) return { ok: false, error: 'That record is already matched to another bank transaction.' };
    const ok = await linkMatch(supabase, txn, kind, recordId, me.id);
    if (!ok) return { ok: false, error: 'This transaction has already been reviewed.' };
    revalidateBanking(txn.account_id);
    return { ok: true, message: 'Matched' };
  } catch (e) { return fail(e); }
}

export type ExpenseInput = {
  vendor: string; description?: string | null; spentOn: string; categoryId: string | null; nature: ExpenseNature; businessPct?: number | null;
  spentBy: string; gst?: number | null; ruleId?: string | null; notes?: string | null;
};

/** New expense from a money-out bank row, linked both ways; the row becomes "Recorded". */
export async function createExpenseFromTxn(txnId: string, input: ExpenseInput): Promise<ActionResult<{ expenseId: string }>> {
  const me = await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    if (num(txn.amount) >= 0) return { ok: false, error: 'Money coming in can’t be an expense. Record it as income or a client payment.' };
    const vendor = (input.vendor ?? '').trim();
    if (!vendor) return { ok: false, error: 'Add who you paid.' };
    if (!isDate(input.spentOn)) return { ok: false, error: 'Choose a date.' };
    if (!NATURES.includes(input.nature)) return { ok: false, error: 'Choose business, personal or mixed.' };
    if (!isId(input.spentBy)) return { ok: false, error: 'Choose who spent it.' };
    if (input.categoryId && !isId(input.categoryId)) return { ok: false, error: 'Choose a category.' };
    const pct = input.nature === 'mixed' ? Math.round(num(input.businessPct)) : input.nature === 'personal' ? 0 : 100;
    if (input.nature === 'mixed' && (pct < 1 || pct > 99)) return { ok: false, error: 'Business share must be between 1 and 99%.' };
    const locked = await lockedError(supabase, input.spentOn);
    if (locked) return { ok: false, error: locked };

    const account = must(await supabase.from('money_accounts').select('currency').eq('id', txn.account_id).single());
    const total = round2(Math.abs(num(txn.amount)));
    const gst = round2(Math.max(0, num(input.gst)));
    if (gst > total) return { ok: false, error: 'GST/HST can’t be more than the total.' };
    const fx = await rateOn(account.currency, input.spentOn, supabase);

    const exp = must(await supabase.from('expenses').insert({
      spent_on: input.spentOn, vendor: vendor.slice(0, 120), description: input.description?.trim() || null, category_id: input.categoryId || null,
      spent_by: input.spentBy, paid_from_account_id: txn.account_id, nature: input.nature, business_pct: input.nature === 'personal' ? 100 : pct,
      currency: account.currency, subtotal: round2(total - gst), gst_hst: gst, pst: 0, total, fx_rate: fx,
      source: 'bank_import', bank_transaction_id: txn.id, notes: input.notes?.trim() || null, created_by: me.id,
    }).select('id').single());

    const ok = await linkMatch(supabase, txn, 'expense', exp.id, me.id, { status: 'created' });
    if (!ok) {
      await supabase.from('expenses').delete().eq('id', exp.id);
      return { ok: false, error: 'This transaction has already been reviewed.' };
    }
    if (input.ruleId && isId(input.ruleId)) {
      const r = must(await supabase.from('rules').select('times_applied').eq('id', input.ruleId).maybeSingle());
      if (r) await supabase.from('rules').update({ times_applied: r.times_applied + 1 }).eq('id', input.ruleId);
    }
    revalidateBanking(txn.account_id);
    return { ok: true, data: { expenseId: exp.id }, message: 'Expense added' };
  } catch (e) { return fail(e); }
}

/** Interest, refunds and other money in that isn't a client payment. */
export async function recordIncomeFromTxn(txnId: string, input: { source: string; description?: string | null; categoryId: string | null; gst?: number | null; receivedOn: string }): Promise<ActionResult<{ incomeId: string }>> {
  const me = await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    if (num(txn.amount) <= 0) return { ok: false, error: 'Only money coming in can be recorded as income.' };
    const source = (input.source ?? '').trim();
    if (!source) return { ok: false, error: 'Add who paid you.' };
    if (!isDate(input.receivedOn)) return { ok: false, error: 'Choose a date.' };
    if (input.categoryId && !isId(input.categoryId)) return { ok: false, error: 'Choose a category.' };
    const locked = await lockedError(supabase, input.receivedOn);
    if (locked) return { ok: false, error: locked };
    const account = must(await supabase.from('money_accounts').select('currency').eq('id', txn.account_id).single());
    const amount = round2(num(txn.amount));
    const gst = round2(Math.max(0, num(input.gst)));
    if (gst > amount) return { ok: false, error: 'GST/HST can’t be more than the amount.' };
    const inc = must(await supabase.from('other_income').insert({
      received_on: input.receivedOn, source: source.slice(0, 120), description: input.description?.trim() || null, category_id: input.categoryId || null,
      account_id: txn.account_id, currency: account.currency, amount, gst_hst: gst, fx_rate: await rateOn(account.currency, input.receivedOn, supabase),
      bank_transaction_id: txn.id, created_by: me.id,
    }).select('id').single());
    const ok = await linkMatch(supabase, txn, 'income', inc.id, me.id, { status: 'created' });
    if (!ok) {
      await supabase.from('other_income').delete().eq('id', inc.id);
      return { ok: false, error: 'This transaction has already been reviewed.' };
    }
    revalidateBanking(txn.account_id);
    return { ok: true, data: { incomeId: inc.id }, message: 'Income recorded' };
  } catch (e) { return fail(e); }
}

/** Record a client payment from a deposit and allocate it to that client's open invoices. */
export async function createPaymentFromTxn(txnId: string, input: { clientId: string; method: PaymentMethod; reference?: string | null; allocations: { invoiceId: string; amount: number }[] }): Promise<ActionResult<{ paymentId: string }>> {
  const me = await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    if (num(txn.amount) <= 0) return { ok: false, error: 'Only deposits can be client payments.' };
    if (!isId(input.clientId)) return { ok: false, error: 'Choose the client.' };
    if (!METHODS.includes(input.method)) return { ok: false, error: 'Choose how they paid.' };
    const locked = await lockedError(supabase, txn.posted_on);
    if (locked) return { ok: false, error: locked };
    const account = must(await supabase.from('money_accounts').select('currency').eq('id', txn.account_id).single());
    const client = must(await supabase.from('clients').select('id, currency').eq('id', input.clientId).maybeSingle());
    if (!client) return { ok: false, error: 'That client no longer exists.' };
    if (client.currency !== account.currency) return { ok: false, error: `This client is billed in ${client.currency}, but the deposit is in ${account.currency}.` };
    const amount = round2(num(txn.amount));

    const allocs = (input.allocations ?? []).filter((a) => isId(a.invoiceId) && num(a.amount) > 0).map((a) => ({ invoiceId: a.invoiceId, amount: round2(num(a.amount)) }));
    const allocated = round2(allocs.reduce((s, a) => s + a.amount, 0));
    if (allocated > amount + 0.001) return { ok: false, error: 'You’ve allocated more than the deposit.' };
    if (allocs.length) {
      const inv = must(await supabase.from('invoices').select('id, client_id, balance, kind, status').in('id', allocs.map((a) => a.invoiceId)));
      for (const a of allocs) {
        const i = inv.find((x) => x.id === a.invoiceId);
        if (!i || i.client_id !== client.id || i.kind !== 'invoice') return { ok: false, error: 'An invoice in the allocation belongs to another client.' };
        if (a.amount > num(i.balance) + 0.001) return { ok: false, error: 'An allocation is more than the invoice’s balance.' };
      }
    }

    const pay = must(await supabase.from('payments').insert({
      client_id: client.id, received_on: txn.posted_on, amount, currency: account.currency, fx_rate: await rateOn(account.currency, txn.posted_on, supabase),
      method: input.method, deposit_account_id: txn.account_id, reference: input.reference?.trim() || null, recorded_by: me.id,
      notes: allocated < amount ? `Unallocated ${(amount - allocated).toFixed(2)} (from bank import)` : null,
    }).select('id').single());
    if (allocs.length) {
      const res = await supabase.from('payment_allocations').insert(allocs.map((a) => ({ payment_id: pay.id, invoice_id: a.invoiceId, amount: a.amount })));
      if (res.error) { await supabase.from('payments').delete().eq('id', pay.id); return { ok: false, error: res.error.message }; }
    }
    const ok = await linkMatch(supabase, txn, 'payment', pay.id, me.id, { status: 'created' });
    if (!ok) {
      await supabase.from('payments').delete().eq('id', pay.id);
      return { ok: false, error: 'This transaction has already been reviewed.' };
    }
    revalidateBanking(txn.account_id);
    return { ok: true, data: { paymentId: pay.id }, message: 'Payment recorded' };
  } catch (e) { return fail(e); }
}

/** Money moved between our own accounts (e.g. paying the card from EQ). Both sides are set aside with a note. */
export async function markTransfer(txnId: string, input: { counterpartAccountId?: string | null; note?: string | null }): Promise<ActionResult<{ pairedId: string | null }>> {
  const me = await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    const counterAcct = input.counterpartAccountId && isId(input.counterpartAccountId)
      ? must(await supabase.from('money_accounts').select('id, name').eq('id', input.counterpartAccountId).maybeSingle()) : null;
    const thisAcct = must(await supabase.from('money_accounts').select('name').eq('id', txn.account_id).single());
    const toFrom = num(txn.amount) < 0 ? 'to' : 'from';
    const note = input.note?.trim() || `Transfer ${toFrom} ${counterAcct?.name ?? 'another own account'}`;
    const now = new Date().toISOString();
    const done = must(await supabase.from('bank_transactions').update({ status: 'ignored', note, reviewed_by: me.id, reviewed_at: now })
      .eq('id', txn.id).eq('status', 'unreviewed').select('id'));
    if (!done.length) return { ok: false, error: 'This transaction has already been reviewed.' };
    let pairedId: string | null = null;
    const other = await findCounterpart(supabase, txn, counterAcct?.id);
    if (other) {
      must(await supabase.from('bank_transactions').update({ status: 'ignored', note: `Transfer ${num(other.amount) < 0 ? 'to' : 'from'} ${thisAcct.name}`, reviewed_by: me.id, reviewed_at: now })
        .eq('id', other.id).eq('status', 'unreviewed').select('id'));
      pairedId = other.id;
    }
    revalidateBanking(txn.account_id);
    return { ok: true, data: { pairedId }, message: pairedId ? 'Both sides marked as a transfer' : 'Marked as a transfer' };
  } catch (e) { return fail(e); }
}

/** Not part of the books (duplicate, pending reversal, personal noise). */
export async function ignoreTransaction(txnId: string, note?: string | null): Promise<ActionResult> {
  const me = await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status !== 'unreviewed') return { ok: false, error: 'This transaction has already been reviewed.' };
    must(await supabase.from('bank_transactions').update({ status: 'ignored', note: note?.trim() || null, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
      .eq('id', txn.id).select('id'));
    revalidateBanking(txn.account_id);
    return { ok: true, message: 'Ignored' };
  } catch (e) { return fail(e); }
}

/** Undo a review from the toast: back to the queue, and remove anything that was created from it. */
export async function undoReview(txnIds: string[]): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    if (!Array.isArray(txnIds) || !txnIds.length) return { ok: false, error: 'Nothing to undo.' };
    let account: string | null = null;
    for (const id of txnIds.slice(0, 4)) {
      const txn = await loadTxn(supabase, id);
      if (!txn || txn.status === 'unreviewed') continue;
      await reopenTxn(supabase, txn, true);
      account = txn.account_id;
    }
    revalidateBanking(account);
    return { ok: true, message: 'Back in the queue' };
  } catch (e) { return fail(e); }
}
