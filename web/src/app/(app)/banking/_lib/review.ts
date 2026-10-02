import 'server-only';
import { revalidatePath } from 'next/cache';
import { addDays, format, parseISO } from 'date-fns';
import type { Db } from '@/lib/db';
import { must } from '@/lib/db';
import { num, date as fmtDate } from '@/lib/format';
import type { Row } from '@/lib/types';
import type { MatchKind } from '@/components/banking/types';

export const MATCH_COL = {
  expense: 'matched_expense_id',
  payment: 'matched_payment_id',
  transfer: 'matched_transfer_id',
  income: 'matched_income_id',
} as const satisfies Record<MatchKind, keyof Row<'bank_transactions'>>;

export function revalidateBanking(accountId?: string | null) {
  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/banking');
  revalidatePath('/banking/review');
  if (accountId) revalidatePath(`/banking/${accountId}`);
}

export async function loadTxn(supabase: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return must(await supabase.from('bank_transactions').select('*').eq('id', id).maybeSingle());
}

/** Books are closed before `lock_books_before`: new records can't be dated earlier. */
export async function lockedError(supabase: Db, on: string) {
  const p = must(await supabase.from('business_profile').select('lock_books_before').single());
  if (p.lock_books_before && on < p.lock_books_before) {
    return `The books are closed before ${fmtDate(p.lock_books_before)}. Reopen them in Settings to record something dated ${fmtDate(on)}.`;
  }
  return null;
}

/** Is a record already linked to some other bank row? */
export async function recordTaken(supabase: Db, kind: MatchKind, recordId: string, exceptTxn?: string) {
  let q = supabase.from('bank_transactions').select('id').eq(MATCH_COL[kind], recordId);
  if (exceptTxn) q = q.neq('id', exceptTxn);
  const rows = must(await q.limit(1));
  return rows.length > 0;
}

/** Link a bank row to an existing record and mark it matched. */
export async function linkMatch(supabase: Db, txn: Row<'bank_transactions'>, kind: MatchKind, recordId: string, by: string | null, opts: { auto?: boolean; status?: 'matched' | 'created' } = {}) {
  const patch = {
    status: opts.status ?? 'matched',
    matched_expense_id: null as string | null, matched_payment_id: null as string | null,
    matched_transfer_id: null as string | null, matched_income_id: null as string | null,
    auto_matched: !!opts.auto, reviewed_by: by, reviewed_at: new Date().toISOString(),
  };
  patch[MATCH_COL[kind]] = recordId;
  const updated = must(await supabase.from('bank_transactions').update(patch).eq('id', txn.id).eq('status', 'unreviewed').select('id'));
  if (!updated.length) return false;
  if (kind === 'expense') must(await supabase.from('expenses').update({ bank_transaction_id: txn.id }).eq('id', recordId).select('id'));
  if (kind === 'income') must(await supabase.from('other_income').update({ bank_transaction_id: txn.id }).eq('id', recordId).select('id'));
  return true;
}

/** Back to the queue. Clears links; `deleteCreated` also removes a record that was created from this row. */
export async function reopenTxn(supabase: Db, txn: Row<'bank_transactions'>, deleteCreated: boolean) {
  const created = txn.status === 'created';
  if (txn.matched_expense_id) {
    if (created && deleteCreated) must(await supabase.from('expenses').delete().eq('id', txn.matched_expense_id).eq('bank_transaction_id', txn.id).select('id'));
    else must(await supabase.from('expenses').update({ bank_transaction_id: null }).eq('id', txn.matched_expense_id).eq('bank_transaction_id', txn.id).select('id'));
  }
  if (txn.matched_income_id) {
    if (created && deleteCreated) must(await supabase.from('other_income').delete().eq('id', txn.matched_income_id).eq('bank_transaction_id', txn.id).select('id'));
    else must(await supabase.from('other_income').update({ bank_transaction_id: null }).eq('id', txn.matched_income_id).select('id'));
  }
  if (txn.matched_payment_id && created && deleteCreated) {
    must(await supabase.from('payments').delete().eq('id', txn.matched_payment_id).select('id'));
  }
  // Clear the row (links may already be nulled by the deletes above).
  must(await supabase.from('bank_transactions').update({
    status: 'unreviewed', matched_expense_id: null, matched_payment_id: null, matched_transfer_id: null, matched_income_id: null,
    note: null, auto_matched: false, reviewed_by: null, reviewed_at: null,
  }).eq('id', txn.id).select('id'));
}

/** The other side of a move between our own accounts: same amount, opposite sign, ±5 days, still unreviewed. */
export async function findCounterpart(supabase: Db, txn: Row<'bank_transactions'>, accountId?: string | null) {
  let q = supabase.from('bank_transactions').select('*').neq('account_id', txn.account_id).eq('status', 'unreviewed')
    .eq('amount', -num(txn.amount))
    .gte('posted_on', format(addDays(parseISO(txn.posted_on), -5), 'yyyy-MM-dd'))
    .lte('posted_on', format(addDays(parseISO(txn.posted_on), 5), 'yyyy-MM-dd'));
  if (accountId) q = q.eq('account_id', accountId);
  const rows = must(await q.order('posted_on').limit(5));
  return rows.sort((a, b) => Math.abs(parseISO(a.posted_on).getTime() - parseISO(txn.posted_on).getTime()) - Math.abs(parseISO(b.posted_on).getTime() - parseISO(txn.posted_on).getTime()))[0] ?? null;
}
