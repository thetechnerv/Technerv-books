'use server';
import { adminDb, db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { plural } from '@/lib/format';
import { revalidateBanking } from './_lib/review';

/**
 * Undo an import: deletes the batch's rows nobody has matched or recorded.
 * Rows already linked to records stay (they're in the books); the batch and its
 * stored CSV go once nothing is left in it.
 */
export async function undoImport(batchId: string): Promise<ActionResult<{ deleted: number; kept: number }>> {
  await currentMember();
  try {
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) return { ok: false, error: 'Import not found.' };
    const supabase = await db();
    const batch = must(await supabase.from('import_batches').select('account_id').eq('id', batchId).maybeSingle());
    if (!batch) return { ok: false, error: 'Import not found.' };
    const res = must(await supabase.rpc('undo_import', { p_batch: batchId })) as { deleted: number; kept: number; batch_deleted: boolean; file_path: string | null };
    if (res.batch_deleted && res.file_path) await adminDb().storage.from('accounts').remove([res.file_path]);
    revalidateBanking(batch.account_id);
    return {
      ok: true, data: { deleted: res.deleted, kept: res.kept },
      message: res.kept ? `Removed ${res.deleted} · kept ${res.kept} already matched` : `Removed ${plural(res.deleted, 'transaction')}`,
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t undo the import.' }; }
}
