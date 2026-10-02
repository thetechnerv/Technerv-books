'use server';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { loadTxn, reopenTxn, revalidateBanking } from '../_lib/review';

/**
 * Put a reviewed transaction back in the queue. Any expense, payment or income it
 * was linked to is kept — only the link is removed.
 */
export async function reopenTransaction(txnId: string): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    const txn = await loadTxn(supabase, txnId);
    if (!txn) return { ok: false, error: 'That transaction no longer exists.' };
    if (txn.status === 'unreviewed') return { ok: true, message: 'Already waiting for review' };
    await reopenTxn(supabase, txn, false);
    revalidateBanking(txn.account_id);
    return { ok: true, message: txn.status === 'ignored' ? 'Back in the review queue' : 'Unmatched · back in the review queue' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t re-open it.' }; }
}
