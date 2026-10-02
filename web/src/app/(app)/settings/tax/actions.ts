'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { isUuid } from '@/components/settings/validate';
import type { ActionResult } from '@/lib/types';

const KINDS = ['gst', 'hst', 'pst', 'zero', 'exempt'] as const;
const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

export async function saveTaxRate(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  const id = String(fd.get('id') ?? '') || null;
  if (id && !isUuid(id)) return { ok: false, error: 'Unknown record.' };
  const code = String(fd.get('code') ?? '').trim().toUpperCase();
  const name = String(fd.get('name') ?? '').trim();
  const kind = String(fd.get('kind') ?? '') as (typeof KINDS)[number];
  const province = String(fd.get('province') ?? '') || null;
  const ratePct = Number(String(fd.get('rate') ?? '').replace('%', '').trim());
  const recoverable = fd.get('is_recoverable') === 'on';
  const active = fd.get('active') === 'on';

  if (!/^[A-Z0-9-]{2,12}$/.test(code)) return { ok: false, error: 'Code: 2–12 capital letters, numbers or dashes (e.g. HST-ON).' };
  if (!name || name.length > 60) return { ok: false, error: 'Give the rate a name (up to 60 characters).' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'Pick a tax type.' };
  if (province && !PROVINCES.includes(province)) return { ok: false, error: 'Pick a province.' };
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 30) return { ok: false, error: 'Rate must be between 0% and 30%.' };
  if ((kind === 'zero' || kind === 'exempt') && ratePct !== 0) return { ok: false, error: 'Zero-rated and exempt rates are 0%.' };
  const rate = Math.round(ratePct * 100) / 10000;

  const supabase = await db();
  const dupe = must(await supabase.from('tax_rates').select('id').eq('code', code).maybeSingle());
  if (dupe && dupe.id !== id) return { ok: false, error: `There’s already a rate with code ${code}.` };

  if (id) {
    const before = must(await supabase.from('tax_rates').select('*').eq('id', id).maybeSingle());
    if (!before) return { ok: false, error: 'That tax rate no longer exists.' };
    if (Number(before.rate) !== rate) {
      const { count } = await supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('tax_rate_id', id);
      if (count) return { ok: false, error: `This rate is on ${count} invoice lines, so its percentage can’t change. Add a new rate and deactivate this one.` };
    }
    if (!active || code !== before.code) {
      const profile = must(await supabase.from('business_profile').select('default_tax_code').single());
      if (profile.default_tax_code === before.code) return { ok: false, error: 'This is the default tax code. Choose another default first.' };
    }
    must(await supabase.from('tax_rates').update({ code, name, kind, province, rate, is_recoverable: recoverable, active }).eq('id', id).select('id'));
    revalidatePath('/', 'layout');
    return { ok: true, data: { id }, message: 'Tax rate saved' };
  }
  const row = must(await supabase.from('tax_rates').insert({ code, name, kind, province, rate, is_recoverable: recoverable, active }).select('id').single());
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: row.id }, message: 'Tax rate added' };
}

export async function setTaxRateActive(id: string, active: boolean): Promise<ActionResult> {
  await currentMember();
  if (!isUuid(id) || typeof active !== 'boolean') return { ok: false, error: 'Unknown record.' };
  const supabase = await db();
  const rate = must(await supabase.from('tax_rates').select('code').eq('id', id).maybeSingle());
  if (!rate) return { ok: false, error: 'That tax rate no longer exists.' };
  if (!active) {
    const profile = must(await supabase.from('business_profile').select('default_tax_code').single());
    if (profile.default_tax_code === rate.code) return { ok: false, error: 'This is the default tax code. Choose another default first.' };
  }
  must(await supabase.from('tax_rates').update({ active }).eq('id', id).select('id'));
  revalidatePath('/', 'layout');
  return { ok: true };
}
