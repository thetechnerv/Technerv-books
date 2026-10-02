import { db, must } from '@/lib/db';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { num, round2 } from '@/lib/format';

const csv = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CRA-style vehicle logbook: date, driver, from, destination, purpose, km, running total, rate, allowance. */
export async function GET(req: Request) {
  await currentMember();
  const url = new URL(req.url);
  const [profile, members, supabase] = await Promise.all([businessProfile(), allMembers(), db()]);
  const fy = Number(url.searchParams.get('fy')) || fiscalYearOf(new Date(), profile.fiscal_year_end);
  const member = url.searchParams.get('member');
  const range = fiscalRange(fy, profile.fiscal_year_end);
  let q = supabase.from('mileage_trips').select('*').gte('trip_on', range.start).lte('trip_on', range.end).order('trip_on').order('created_at');
  if (member && /^[0-9a-f-]{36}$/i.test(member)) q = q.eq('member_id', member);
  const trips = must(await q);
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

  const running = new Map<string, number>();
  const lines = [['Date', 'Driver', 'From', 'Destination', 'Business purpose', 'Round trip', 'Km', 'Running total km (driver)', 'Rate per km', 'Allowance (CAD)', 'Reimbursed'].join(',')];
  let km = 0, total = 0;
  for (const t of trips) {
    const r = round2((running.get(t.member_id) ?? 0) + num(t.km));
    running.set(t.member_id, r);
    const amt = round2(num(t.km) * num(t.rate_per_km));
    km += num(t.km); total += amt;
    lines.push([t.trip_on, names[t.member_id] ?? '', t.origin, t.destination, t.purpose, t.round_trip ? 'Yes' : 'No', num(t.km).toFixed(1), r.toFixed(1), num(t.rate_per_km).toFixed(3), amt.toFixed(2), t.reimbursed ? 'Yes' : 'No'].map(csv).join(','));
  }
  lines.push(['', '', '', '', 'Total', '', km.toFixed(1), '', '', round2(total).toFixed(2), ''].map(csv).join(','));
  lines.push('');
  lines.push(csv(`${profile.legal_name} — vehicle logbook ${range.label} (${range.start} to ${range.end}). Rates: ${profile.mileage_rate}/km first 5,000 km per calendar year, ${profile.mileage_rate_after_5000}/km after.`));

  const who = member && names[member] ? `-${names[member].split(' ')[0]!.toLowerCase()}` : '';
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="mileage-logbook-fy${fy}${who}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
