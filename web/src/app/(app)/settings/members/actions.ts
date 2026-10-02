'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isEmail, isHex, isUuid } from '@/components/settings/validate';
import type { ActionResult } from '@/lib/types';

export async function saveMember(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const me = await currentMember();
  const id = String(fd.get('id') ?? '') || null;
  if (id && !isUuid(id)) return { ok: false, error: 'Unknown member.' };
  const full_name = String(fd.get('full_name') ?? '').trim().replace(/\s+/g, ' ');
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const initials = String(fd.get('initials') ?? '').trim().toUpperCase() || null;
  const color = String(fd.get('color') ?? '').trim().toUpperCase() || null;
  const pctRaw = String(fd.get('ownership_pct') ?? '').replace('%', '').trim();
  const ownership_pct = pctRaw === '' ? null : Number(pctRaw);
  const active = fd.get('active') === 'on';

  if (!full_name || full_name.length > 80) return { ok: false, error: 'Enter the member’s full name.' };
  if (!isEmail(email)) return { ok: false, error: 'Enter a valid email — it’s what they sign in with.' };
  if (initials && !/^[A-Z]{1,3}$/.test(initials)) return { ok: false, error: 'Initials are 1–3 letters.' };
  if (color && !isHex(color)) return { ok: false, error: 'Pick an avatar colour.' };
  if (ownership_pct !== null && (!Number.isFinite(ownership_pct) || ownership_pct < 0 || ownership_pct > 100)) return { ok: false, error: 'Ownership must be between 0% and 100%.' };
  if (id === me.id && !active) return { ok: false, error: 'You can’t deactivate yourself while signed in.' };

  const supabase = await db();
  const dupe = must(await supabase.from('members').select('id, email')).find((x) => x.email.toLowerCase() === email);
  if (dupe && dupe.id !== id) return { ok: false, error: 'Another member already uses that email.' };

  const fields = { full_name, email, initials, color, ownership_pct, active };
  if (id) {
    must(await supabase.from('members').update(fields).eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, data: { id }, message: 'Member saved' };
  }
  const row = must(await supabase.from('members').insert({ ...fields, role: 'owner' }).select('id').single());
  // Every member gets a "personal" account so out-of-pocket spending can be recorded.
  await supabase.from('money_accounts').insert({
    name: `${full_name.split(' ')[0]} — personal`, kind: 'personal', owner_member_id: row.id, is_business: false, currency: 'CAD', color: '#9BB1B5',
  });
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id }, message: 'Member added — set up their sign-in next' };
}
