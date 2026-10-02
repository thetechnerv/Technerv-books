'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isHex, isUuid } from '@/components/settings/validate';
import type { ActionResult, Enum } from '@/lib/types';

const KINDS: Enum<'money_account_kind'>[] = ['bank', 'credit_card', 'cash', 'personal', 'payment_processor'];
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'INR'];

export async function saveAccount(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const id = String(fd.get('id') ?? '') || null;
  if (id && !isUuid(id)) return { ok: false, error: 'Unknown record.' };
  const name = String(fd.get('name') ?? '').trim();
  const kind = String(fd.get('kind') ?? '') as Enum<'money_account_kind'>;
  const institution = String(fd.get('institution') ?? '').trim() || null;
  const currency = String(fd.get('currency') ?? 'CAD');
  const last4 = String(fd.get('last4') ?? '').trim() || null;
  const owner_member_id = String(fd.get('owner_member_id') ?? '') || null;
  const color = String(fd.get('color') ?? '').toUpperCase() || null;
  const notes = String(fd.get('notes') ?? '').trim() || null;
  const openingRaw = String(fd.get('opening_balance') ?? '').replace(/[$,\s]/g, '');
  const opening_balance = openingRaw === '' ? 0 : Number(openingRaw);
  const archived = fd.get('archived') === 'on';

  if (!name || name.length > 60) return { ok: false, error: 'Give the account a name.' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'Pick an account type.' };
  if (!CURRENCIES.includes(currency)) return { ok: false, error: 'Pick a currency.' };
  if (last4 && !/^\d{4}$/.test(last4)) return { ok: false, error: 'Last 4 must be four digits.' };
  if (kind === 'personal' && !owner_member_id) return { ok: false, error: 'Choose whose personal money this is.' };
  if (color && !isHex(color)) return { ok: false, error: 'Pick a colour.' };
  if (!Number.isFinite(opening_balance)) return { ok: false, error: 'Opening balance must be a number.' };
  if (notes && notes.length > 500) return { ok: false, error: 'Keep notes under 500 characters.' };

  const supabase = await db();
  if (id) {
    const before = must(await supabase.from('money_accounts').select('currency').eq('id', id).maybeSingle());
    if (!before) return { ok: false, error: 'That account no longer exists.' };
    if (before.currency !== currency) {
      const { count } = await supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('account_id', id);
      if (count) return { ok: false, error: `This account has ${count} imported transactions in ${before.currency}, so its currency can’t change.` };
    }
  }
  const fields = {
    name, kind, institution, currency, last4, color, notes, opening_balance, archived,
    owner_member_id: kind === 'personal' || kind === 'credit_card' ? owner_member_id : null,
    is_business: kind !== 'personal',
  };
  if (id) {
    must(await supabase.from('money_accounts').update(fields).eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, data: { id }, message: archived ? 'Account archived' : 'Account saved' };
  }
  const row = must(await supabase.from('money_accounts').insert(fields).select('id').single());
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id }, message: 'Account added' };
}

export async function setAccountArchived(id: string, archived: boolean): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id) || typeof archived !== 'boolean') return { ok: false, error: 'Unknown record.' };
  const supabase = await db();
  must(await supabase.from('money_accounts').update({ archived }).eq('id', id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}
