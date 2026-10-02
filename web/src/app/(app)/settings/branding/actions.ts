'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const BUCKET = 'accounts';
const LOGO_PATH = /^branding\/logo-\d{10,16}\.(png|jpg)$/;

/** Step 1: a one-time signed upload URL at branding/logo-<timestamp>.<ext>. */
export async function createLogoUpload(type: string): Promise<ActionResult<{ path: string; token: string }>> {
  await currentMember();
  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : null;
  if (!ext) return { ok: false, error: 'Use a PNG or JPEG image.' };
  const path = `branding/logo-${Date.now()}.${ext}`;
  const supabase = await db();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { path: data.path, token: data.token } };
}

/** Step 2: point the profile at the uploaded logo (or null for the Tech Nerv mark). Returns the previous path for undo. */
export async function setLogo(path: string | null): Promise<ActionResult<{ previous: string | null }>> {
  await currentMember();
  if (path !== null && !LOGO_PATH.test(path)) return { ok: false, error: 'That isn’t a logo upload.' };
  const supabase = await db();
  if (path) {
    const name = path.slice('branding/'.length);
    const { data } = await supabase.storage.from(BUCKET).list('branding', { search: name, limit: 1 });
    if (!data?.some((o) => o.name === name)) return { ok: false, error: 'The upload didn’t finish. Try again.' };
  }
  const before = must(await supabase.from('business_profile').select('logo_path').single());
  const { error } = await supabase.from('business_profile').update({ logo_path: path, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, data: { previous: before.logo_path } };
}
