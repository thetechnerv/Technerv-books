'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isUuid } from '@/components/settings/validate';
import type { ActionResult } from '@/lib/types';

export async function saveItem(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const id = String(fd.get('id') ?? '') || null;
  if (id && !isUuid(id)) return { ok: false, error: 'Unknown record.' };
  const name = String(fd.get('name') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim() || null;
  const unit = String(fd.get('unit') ?? '').trim().toLowerCase() || 'each';
  const priceRaw = String(fd.get('unit_price') ?? '').replace(/[$,\s]/g, '');
  const unit_price = priceRaw === '' ? 0 : Number(priceRaw);
  const tax_rate_id = String(fd.get('tax_rate_id') ?? '') || null;
  const category_id = String(fd.get('category_id') ?? '') || null;
  const archived = fd.get('archived') === 'on';

  if (!name || name.length > 100) return { ok: false, error: 'Give the product or service a name.' };
  if (description && description.length > 500) return { ok: false, error: 'Keep the description under 500 characters.' };
  if (unit.length > 20) return { ok: false, error: 'Keep the unit short (e.g. hour, month).' };
  if (!Number.isFinite(unit_price) || unit_price < 0 || unit_price > 10_000_000) return { ok: false, error: 'Enter a price of $0 or more.' };
  if (tax_rate_id && !isUuid(tax_rate_id)) return { ok: false, error: 'Pick a tax rate.' };
  if (category_id && !isUuid(category_id)) return { ok: false, error: 'Pick an income category.' };

  const supabase = await db();
  if (category_id) {
    const cat = must(await supabase.from('categories').select('kind').eq('id', category_id).maybeSingle());
    if (cat?.kind !== 'income') return { ok: false, error: 'Products use an income category.' };
  }
  const fields = { name, description, unit, unit_price: Math.round(unit_price * 100) / 100, tax_rate_id, category_id, archived };
  if (id) {
    must(await supabase.from('items').update(fields).eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, data: { id }, message: 'Saved' };
  }
  const row = must(await supabase.from('items').insert(fields).select('id').single());
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id }, message: 'Added to your catalogue' };
}

export async function setItemArchived(id: string, archived: boolean): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id) || typeof archived !== 'boolean') return { ok: false, error: 'Unknown record.' };
  const supabase = await db();
  must(await supabase.from('items').update({ archived }).eq('id', id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}
