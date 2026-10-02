'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { CATEGORY_ICON_NAMES } from '@/components/settings/category-icons';
import { CCA_CLASSES, isHex, isUuid } from '@/components/settings/validate';
import type { ActionResult } from '@/lib/types';

export async function saveCategory(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const id = String(fd.get('id') ?? '') || null;
  if (id && !isUuid(id)) return { ok: false, error: 'Unknown record.' };
  const name = String(fd.get('name') ?? '').trim().replace(/\s+/g, ' ');
  const kind = String(fd.get('kind') ?? '');
  const gifi_code = String(fd.get('gifi_code') ?? '').trim() || null;
  const pctRaw = String(fd.get('deductible_pct') ?? '100').replace('%', '').trim();
  const deductible_pct = pctRaw === '' ? 100 : Number(pctRaw);
  const is_capital = fd.get('is_capital') === 'on';
  const cca_class = is_capital ? String(fd.get('cca_class') ?? '') || null : null;
  const icon = String(fd.get('icon') ?? '') || null;
  const color = String(fd.get('color') ?? '').toUpperCase() || null;

  if (!name || name.length > 60) return { ok: false, error: 'Give the category a name (up to 60 characters).' };
  if (kind !== 'income' && kind !== 'expense') return { ok: false, error: 'Choose income or expense.' };
  if (gifi_code && !/^\d{4}$/.test(gifi_code)) return { ok: false, error: 'GIFI codes are 4 digits (e.g. 8810).' };
  if (!Number.isFinite(deductible_pct) || deductible_pct < 0 || deductible_pct > 100) return { ok: false, error: 'Deductible must be between 0% and 100%.' };
  if (is_capital && kind !== 'expense') return { ok: false, error: 'Only expense categories can be capital.' };
  if (is_capital && !CCA_CLASSES.some((c) => c.value === cca_class)) return { ok: false, error: 'Pick a CCA class for capital purchases.' };
  if (icon && !CATEGORY_ICON_NAMES.includes(icon)) return { ok: false, error: 'Pick an icon from the list.' };
  if (color && !isHex(color)) return { ok: false, error: 'Pick a colour.' };

  const supabase = await db();
  const siblings = must(await supabase.from('categories').select('id, name').eq('kind', kind));
  const dupe = siblings.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (dupe && dupe.id !== id) return { ok: false, error: `There’s already an ${kind} category called “${name}”.` };

  const fields = { name, gifi_code, deductible_pct: kind === 'income' ? 100 : deductible_pct, is_capital, cca_class, icon, color };
  if (id) {
    must(await supabase.from('categories').update(fields).eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, data: { id }, message: 'Category saved' };
  }
  const last = must(await supabase.from('categories').select('sort').eq('kind', kind).neq('sort', 99).order('sort', { ascending: false }).limit(1).maybeSingle());
  const row = must(await supabase.from('categories').insert({ ...fields, kind, sort: (last?.sort ?? 0) + 1 }).select('id').single());
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id }, message: 'Category added' };
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id) || typeof archived !== 'boolean') return { ok: false, error: 'Unknown record.' };
  const supabase = await db();
  must(await supabase.from('categories').update({ archived }).eq('id', id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Persists a new order: `ids` in display order. */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  await currentMember();
  if (!Array.isArray(ids) || ids.length > 500 || ids.some((i) => !isUuid(i))) return { ok: false, error: 'Invalid order.' };
  const supabase = await db();
  const current = must(await supabase.from('categories').select('id, sort').in('id', ids));
  const sortOf = new Map(current.map((c) => [c.id, c.sort]));
  // Keep each list in its own sort range (expense categories started at 10, income at 1).
  const base = Math.min(...current.map((c) => c.sort));
  const changes = ids.map((id, i) => ({ id, sort: base + i })).filter((c) => sortOf.get(c.id) !== c.sort);
  for (const c of changes) must(await supabase.from('categories').update({ sort: c.sort }).eq('id', c.id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}
