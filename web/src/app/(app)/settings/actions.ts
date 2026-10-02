'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, devBypassEmail, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { parseProfile, validIsoDate } from '@/components/settings/validate';
import type { ActionResult, Update } from '@/lib/types';

/** Saves any business_profile fields present in the form (allow-listed in PROFILE_FIELDS). */
export async function saveProfile(fd: FormData): Promise<ActionResult> {
  await currentMember();
  const entries = [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === 'string');
  const { patch, errors } = parseProfile(entries);
  const firstError = Object.values(errors)[0];
  if (firstError) return { ok: false, error: firstError };
  if (!Object.keys(patch).length) return { ok: true, message: 'Nothing to save' };

  const supabase = await db();

  if (typeof patch.default_tax_code === 'string') {
    const rate = must(await supabase.from('tax_rates').select('id').eq('code', patch.default_tax_code).eq('active', true).maybeSingle());
    if (!rate) return { ok: false, error: 'Pick an active tax rate as the default.' };
  }

  // A next number that's already taken would make the next invoice fail.
  for (const kind of ['invoice', 'estimate'] as const) {
    const seqKey = kind === 'invoice' ? 'next_invoice_seq' : 'next_estimate_seq';
    const preKey = kind === 'invoice' ? 'invoice_prefix' : 'estimate_prefix';
    if (patch[seqKey] === undefined && patch[preKey] === undefined) continue;
    const current = must(await supabase.from('business_profile').select('invoice_prefix, estimate_prefix, next_invoice_seq, next_estimate_seq').single());
    const prefix = (patch[preKey] ?? current[preKey]) as string;
    const seq = (patch[seqKey] ?? current[seqKey]) as number;
    const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('kind', kind).eq('number', `${prefix}${seq}`);
    if (count) return { ok: false, error: `${prefix}${seq} is already used by an ${kind}. Pick a higher number.` };
  }

  const { error } = await supabase.from('business_profile').update({ ...patch, updated_at: new Date().toISOString() } as Update<'business_profile'>).eq('id', true);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Stores the appearance choice in the `theme` cookie that the root layout reads. */
export async function setTheme(theme: ThemeChoice): Promise<ActionResult> {
  await currentMember();
  if (!['system', 'light', 'dark'].includes(theme)) return { ok: false, error: 'Unknown appearance.' };
  const store = await cookies();
  if (theme === 'system') store.delete('theme');
  else store.set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: false });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function signOut(): Promise<ActionResult> {
  await currentMember();
  if (devBypassEmail) return { ok: false, error: 'Sign-in is skipped in local development, so there is nothing to sign out of.' };
  const supabase = await db();
  await supabase.auth.signOut();
  redirect('/login');
}

const LOCKABLE = [
  { table: 'expenses', column: 'spent_on', label: 'expenses' },
  { table: 'invoices', column: 'issue_date', label: 'invoices & estimates' },
  { table: 'payments', column: 'received_on', label: 'payments' },
  { table: 'other_income', column: 'received_on', label: 'other income' },
  { table: 'bank_transactions', column: 'posted_on', label: 'bank transactions' },
  { table: 'member_transfers', column: 'occurred_on', label: 'owner transfers' },
  { table: 'mileage_trips', column: 'trip_on', label: 'trips' },
] as const;

/** How many records a lock date would freeze. */
export async function previewLock(before: string): Promise<ActionResult<{ label: string; count: number }[]>> {
  await currentMember();
  if (!validIsoDate(before)) return { ok: false, error: 'Pick a valid date.' };
  const supabase = await db();
  const counts = await Promise.all(LOCKABLE.map(async (l) => {
    const { count } = await supabase.from(l.table).select('id', { count: 'exact', head: true }).lt(l.column, before);
    return { label: l.label, count: count ?? 0 };
  }));
  return { ok: true, data: counts };
}

/** Closes the books: records dated before `before` can no longer be edited. Pass null to reopen. */
export async function setLockDate(before: string | null): Promise<ActionResult> {
  await currentMember();
  if (before !== null && !validIsoDate(before)) return { ok: false, error: 'Pick a valid date.' };
  if (before && before > new Date().toISOString().slice(0, 10)) return { ok: false, error: 'You can only close a year that has already ended.' };
  const supabase = await db();
  const { error } = await supabase.from('business_profile').update({ lock_books_before: before, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
