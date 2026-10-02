'use server';
import { revalidatePath } from 'next/cache';
import { format, parseISO, isValid } from 'date-fns';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export type TripInput = {
  member_id: string; trip_on: string; origin: string; destination: string; purpose: string;
  /** One-way distance; doubled when round_trip is on. */
  km_one_way: number; round_trip: boolean; project_id?: string | null; reimbursed?: boolean;
};

function revalidateAll() {
  for (const p of ['/mileage', '/balances', '/']) revalidatePath(p);
}

async function locked(...dates: (string | null | undefined)[]) {
  const p = await businessProfile();
  const hit = p.lock_books_before && dates.find((d) => d && d < p.lock_books_before!);
  return hit ? `The books are closed before ${format(parseISO(p.lock_books_before!), 'MMM d, yyyy')}.` : null;
}

export async function saveTrip(id: string | null, input: TripInput): Promise<ActionResult<{ id: string; km: number; rate: number }>> {
  await currentMember();
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trip_on) || !isValid(parseISO(input.trip_on))) return { ok: false, error: 'Pick the trip date.' };
    if (!input.destination?.trim()) return { ok: false, error: 'Where did you go?' };
    if (!input.purpose?.trim()) return { ok: false, error: 'Add the business purpose — CRA needs it in the logbook.' };
    const oneWay = Math.round(Number(input.km_one_way) * 10) / 10;
    if (!(oneWay > 0) || oneWay > 5000) return { ok: false, error: 'Enter the distance in km.' };
    const km = Math.round(oneWay * (input.round_trip ? 2 : 1) * 10) / 10;
    const supabase = await db();
    const prev = id ? must(await supabase.from('mileage_trips').select('trip_on').eq('id', id).maybeSingle()) : null;
    if (id && !prev) return { ok: false, error: 'That trip no longer exists.' };
    const lock = await locked(input.trip_on, prev?.trip_on);
    if (lock) return { ok: false, error: lock };
    const member = must(await supabase.from('members').select('id').eq('id', input.member_id).maybeSingle());
    if (!member) return { ok: false, error: 'Choose who drove.' };
    const { data: rate, error: rateErr } = await supabase.rpc('mileage_rate_for', { p_member: input.member_id, p_trip_on: input.trip_on, p_km: km, ...(id ? { p_exclude: id } : {}) });
    if (rateErr || !rate) return { ok: false, error: rateErr?.message ?? 'Couldn’t work out the mileage rate.' };
    const row = {
      member_id: input.member_id, trip_on: input.trip_on, origin: input.origin?.trim() || null, destination: input.destination.trim(),
      purpose: input.purpose.trim(), km, round_trip: !!input.round_trip, rate_per_km: Number(rate), project_id: input.project_id || null,
      ...(id && input.reimbursed !== undefined ? { reimbursed: input.reimbursed, reimbursed_on: input.reimbursed ? format(new Date(), 'yyyy-MM-dd') : null } : {}),
    };
    const saved = id
      ? must(await supabase.from('mileage_trips').update(row).eq('id', id).select('id').single())
      : must(await supabase.from('mileage_trips').insert(row).select('id').single());
    revalidateAll();
    return { ok: true, data: { id: saved.id, km, rate: Number(rate) } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTrip(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    const supabase = await db();
    const t = must(await supabase.from('mileage_trips').select('trip_on').eq('id', id).maybeSingle());
    if (!t) return { ok: true };
    const lock = await locked(t.trip_on);
    if (lock) return { ok: false, error: lock };
    must(await supabase.from('mileage_trips').delete().eq('id', id).select('id'));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
