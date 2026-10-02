'use server';
import { revalidatePath } from 'next/cache';
import { db, adminDb, must } from './db';
import { currentMember } from './session';
import type { ActionResult } from './types';

export type EntityType = 'expense' | 'invoice' | 'payment' | 'document' | 'bank_transaction';
const BUCKET = 'accounts';

function folderFor(entity: EntityType) {
  return { expense: 'receipts', invoice: 'invoices', payment: 'payments', document: 'documents', bank_transaction: 'bank' }[entity];
}

/** Step 1: get a one-time signed upload URL for a new object. */
export async function createUpload(entity: EntityType, entityId: string, fileName: string): Promise<ActionResult<{ path: string; token: string }>> {
  await currentMember();
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';
  const path = `${folderFor(entity)}/${new Date().getFullYear()}/${entityId}/${Date.now().toString(36)}-${safe}`;
  const supabase = await db();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path: data.path, token: data.token } };
}

/** Step 2: record the uploaded object against its entity. */
export async function registerAttachment(input: {
  entity: EntityType; entityId: string; path: string; fileName: string; mimeType: string; size: number; originalSize: number; compression: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const me = await currentMember();
  const supabase = await db();
  const row = must(await supabase.from('attachments').insert({
    entity_type: input.entity, entity_id: input.entityId, storage_path: input.path, file_name: input.fileName, mime_type: input.mimeType,
    size_bytes: input.size, original_size_bytes: input.originalSize, compression: input.compression, uploaded_by: me.id,
  }).select('id').single());
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id } };
}

export async function deleteAttachment(id: string): Promise<ActionResult> {
  await currentMember();
  const supabase = await db();
  const att = must(await supabase.from('attachments').select('storage_path').eq('id', id).single());
  await supabase.storage.from(BUCKET).remove([att.storage_path]);
  must(await supabase.from('attachments').delete().eq('id', id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Short-lived signed URL for viewing/downloading a stored file. */
export async function signedUrl(path: string, download?: string) {
  await currentMember();
  const supabase = await db();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Upload bytes generated on the server (e.g. an archived invoice PDF). */
export async function putServerFile(path: string, body: Uint8Array | Blob, contentType: string) {
  const { error } = await adminDb().storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
