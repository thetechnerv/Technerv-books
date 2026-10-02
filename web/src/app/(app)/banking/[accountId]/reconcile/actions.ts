'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { num, round2 } from '@/lib/format';
import type { ActionResult } from '@/lib/types';

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

/**
 * Mark a month reconciled: the statement's closing balance agrees with the
 * app's balance (opening + every imported amount to period end). A difference
 * can only be accepted with a note explaining it.
 */
export async function reconcileMonth(input: { accountId: string; periodEnd: string; statementBalance: number; notes?: string | null }): Promise<ActionResult<{ difference: number }>> {
  const me = await currentMember();
  try {
    if (!isId(input.accountId)) return { ok: false, error: 'Account not found.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) return { ok: false, error: 'Choose a month.' };
    if (!Number.isFinite(Number(input.statementBalance))) return { ok: false, error: 'Enter the statement’s closing balance.' };
    const supabase = await db();
    const computed = round2(num(must(await supabase.rpc('account_balance_at', { p_account: input.accountId, p_on: input.periodEnd }))));
    const statement = round2(num(input.statementBalance));
    const difference = round2(statement - computed);
    const notes = input.notes?.trim() || null;
    if (Math.abs(difference) >= 0.005 && !notes) return { ok: false, error: 'There’s a difference — add a note explaining it, or find the missing transaction first.' };
    must(await supabase.from('reconciliations').upsert({
      account_id: input.accountId, period_end: input.periodEnd, statement_balance: statement, computed_balance: computed,
      notes, reconciled_by: me.id, reconciled_at: new Date().toISOString(),
    }, { onConflict: 'account_id,period_end' }).select('id'));
    revalidatePath(`/banking/${input.accountId}/reconcile`);
    revalidatePath('/banking');
    return { ok: true, data: { difference }, message: 'Month reconciled' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t save the reconciliation.' }; }
}

export async function unreconcileMonth(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    if (!isId(id)) return { ok: false, error: 'Not found.' };
    const supabase = await db();
    const rows = must(await supabase.from('reconciliations').delete().eq('id', id).select('account_id'));
    if (rows[0]) revalidatePath(`/banking/${rows[0].account_id}/reconcile`);
    return { ok: true, message: 'Reconciliation removed' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t remove it.' }; }
}
