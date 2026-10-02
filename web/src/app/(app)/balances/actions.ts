'use server';
import { revalidatePath } from 'next/cache';
import { format, parseISO, isValid } from 'date-fns';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export type TransferKind = 'reimbursement' | 'repayment' | 'contribution' | 'dividend' | 'salary' | 'other';
const KINDS: TransferKind[] = ['reimbursement', 'repayment', 'contribution', 'dividend', 'salary', 'other'];

export type SettleInput = {
  memberId: string;
  kind: TransferKind;
  amount: number;
  date: string;
  accountId: string | null;
  notes?: string | null;
  expenseIds: string[];
  tripIds: string[];
  /** Mark the items settled against each other / the running balance without moving money. */
  offset?: boolean;
};

function revalidateAll() {
  for (const p of ['/balances', '/expenses', '/mileage', '/']) revalidatePath(p);
  revalidatePath('/expenses/[id]', 'page');
}

/**
 * Record money moving between the company and an owner, and mark the
 * expenses / trips it covers as settled (linked, so deleting the transfer re-opens them).
 */
export async function settleUp(input: SettleInput): Promise<ActionResult<{ transferId: string | null; covered: number }>> {
  await currentMember();
  try {
    if (!KINDS.includes(input.kind)) return { ok: false, error: 'Choose what kind of transfer this is.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !isValid(parseISO(input.date))) return { ok: false, error: 'Pick a valid date.' };
    const amount = Math.round(Number(input.amount) * 100) / 100;
    const expenseIds = [...new Set(input.expenseIds ?? [])].slice(0, 500);
    const tripIds = [...new Set(input.tripIds ?? [])].slice(0, 500);
    if (input.offset) {
      if (!expenseIds.length && !tripIds.length) return { ok: false, error: 'Pick the items to offset.' };
    } else if (!(amount > 0)) return { ok: false, error: 'Enter an amount.' };
    if (amount > 1_000_000) return { ok: false, error: 'That amount looks too large.' };

    const profile = await businessProfile();
    if (profile.lock_books_before && input.date < profile.lock_books_before) {
      return { ok: false, error: `The books are closed before ${format(parseISO(profile.lock_books_before), 'MMM d, yyyy')}.` };
    }
    const supabase = await db();
    const member = must(await supabase.from('members').select('id').eq('id', input.memberId).maybeSingle());
    if (!member) return { ok: false, error: 'Choose an owner.' };
    if (input.accountId) {
      const acct = must(await supabase.from('money_accounts').select('id').eq('id', input.accountId).maybeSingle());
      if (!acct) return { ok: false, error: 'That account doesn’t exist.' };
    }

    let transferId: string | null = null;
    if (!input.offset) {
      const row = must(await supabase.from('member_transfers').insert({
        member_id: input.memberId, kind: input.kind, amount, occurred_on: input.date, account_id: input.accountId || null, notes: input.notes?.trim() || null,
      }).select('id').single());
      transferId = row.id;
    }
    let covered = 0;
    if (expenseIds.length) {
      const r = must(await supabase.from('expenses').update({ settled: true, settled_on: input.date, settlement_transfer_id: transferId })
        .in('id', expenseIds).eq('spent_by', input.memberId).eq('settled', false).select('id'));
      covered += r.length;
    }
    if (tripIds.length) {
      const r = must(await supabase.from('mileage_trips').update({ reimbursed: true, reimbursed_on: input.date, settlement_transfer_id: transferId })
        .in('id', tripIds).eq('member_id', input.memberId).eq('reimbursed', false).select('id'));
      covered += r.length;
    }
    revalidateAll();
    return { ok: true, data: { transferId, covered } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Undo a transfer. Items it settled are re-opened by the database trigger. */
export async function deleteTransfer(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    const t = must(await supabase.from('member_transfers').select('occurred_on').eq('id', id).maybeSingle());
    if (!t) return { ok: true };
    const profile = await businessProfile();
    if (profile.lock_books_before && t.occurred_on < profile.lock_books_before) return { ok: false, error: 'That transfer is in a closed period.' };
    await supabase.from('bank_transactions').update({ matched_transfer_id: null, status: 'unreviewed' }).eq('matched_transfer_id', id);
    must(await supabase.from('member_transfers').delete().eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Re-open items marked settled by an offset (no transfer). */
export async function reopenItems(memberId: string, expenseIds: string[], tripIds: string[]): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    if (expenseIds.length) must(await supabase.from('expenses').update({ settled: false, settled_on: null, settlement_transfer_id: null }).in('id', expenseIds).eq('spent_by', memberId).select('id'));
    if (tripIds.length) must(await supabase.from('mileage_trips').update({ reimbursed: false, reimbursed_on: null, settlement_transfer_id: null }).in('id', tripIds).eq('member_id', memberId).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
