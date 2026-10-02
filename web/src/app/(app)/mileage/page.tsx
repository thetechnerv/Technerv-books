import { Download, Plus } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/group';
import { LinkSegmented } from '@/components/ui/segmented';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { MileageView, ReimburseButton, type Trip, type Route } from '@/components/expenses/mileage';
import { hrefWith } from '@/components/expenses/url';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { money, num, round2, isoToday, plural } from '@/lib/format';

export const metadata = { title: 'Mileage' };

export default async function MileagePage({ searchParams }: { searchParams: Promise<{ fy?: string; member?: string; new?: string }> }) {
  const sp = await searchParams;
  const [me, profile, members, supabase] = await Promise.all([currentMember(), businessProfile(), allMembers(), db()]);
  const yearEnd = profile.fiscal_year_end;
  const [allRes, projects, bank] = await Promise.all([
    supabase.from('mileage_trips').select('*').order('trip_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
    supabase.from('money_accounts').select('id').eq('kind', 'bank').eq('currency', 'CAD').eq('archived', false).limit(1).maybeSingle(),
  ]);
  const all: Trip[] = must(allRes).map((t) => ({
    id: t.id, member_id: t.member_id, trip_on: t.trip_on, origin: t.origin, destination: t.destination, purpose: t.purpose, km: num(t.km),
    rate_per_km: num(t.rate_per_km), round_trip: t.round_trip, project_id: t.project_id, reimbursed: t.reimbursed, amount: round2(num(t.km) * num(t.rate_per_km)),
  }));

  const fyNow = fiscalYearOf(new Date(), yearEnd);
  const fys = [...new Set([fyNow, ...all.map((t) => fiscalYearOf(t.trip_on, yearEnd))])].sort((a, b) => b - a);
  const latestWithTrips = all[0] ? fiscalYearOf(all[0].trip_on, yearEnd) : fyNow;
  const fy = sp.fy && fys.includes(Number(sp.fy)) ? Number(sp.fy) : all.some((t) => fiscalYearOf(t.trip_on, yearEnd) === fyNow) ? fyNow : latestWithTrips;
  const range = fiscalRange(fy, yearEnd);
  const memberFilter = members.some((m) => m.id === sp.member) ? sp.member : undefined;
  const inFy = all.filter((t) => t.trip_on >= range.start && t.trip_on <= range.end);
  const shown = inFy.filter((t) => !memberFilter || t.member_id === memberFilter);
  const params = { fy: sp.fy, member: memberFilter };
  const calYear = new Date().getFullYear();

  // Frequent routes (one-way distance), most used first.
  const routeMap = new Map<string, Route>();
  for (const t of all) {
    if (!t.destination) continue;
    const kmOneWay = t.round_trip ? t.km / 2 : t.km;
    const key = `${t.origin}>${t.destination}>${kmOneWay}`;
    const r = routeMap.get(key) ?? { origin: t.origin, destination: t.destination, kmOneWay, roundTrip: t.round_trip, purpose: t.purpose, times: 0 };
    r.times++;
    routeMap.set(key, r);
  }
  const routes = [...routeMap.values()].sort((a, b) => b.times - a.times).slice(0, 8);

  return (
    <Page
      title="Mileage"
      subtitle={`${range.label} · ${plural(shown.length, 'trip')}`}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <LinkSegmented id="mileage-fy" value={String(fy)} options={fys.map((y) => ({ value: String(y), label: `FY${y}`, href: hrefWith('/mileage', params, { fy: String(y) }) }))} />
          <LinkSegmented id="mileage-member" value={memberFilter ?? 'all'}
            options={[{ value: 'all', label: 'Both', href: hrefWith('/mileage', params, { member: null }) }, ...members.map((m) => ({ value: m.id, label: m.full_name.split(' ')[0]!, href: hrefWith('/mileage', params, { member: m.id }) }))]} />
        </div>
      }
      actions={
        <>
          <IconButton label="Download CRA logbook (CSV)" href={`/mileage/export?fy=${fy}${memberFilter ? `&member=${memberFilter}` : ''}`}><Download className="size-5" /></IconButton>
          <IconButton label="Add trip" href={hrefWith('/mileage', params, { new: '1' })} className="lg:hidden"><Plus className="size-6" strokeWidth={2.2} /></IconButton>
          <Button href={hrefWith('/mileage', params, { new: '1' })} variant="filled" size="md" icon={<Plus className="size-4" />} className="hidden lg:inline-flex">Add trip</Button>
        </>
      }
    >
      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:mb-6">
        {members.filter((m) => !memberFilter || m.id === memberFilter).map((m) => {
          const mine = inFy.filter((t) => t.member_id === m.id);
          const km = mine.reduce((s, t) => s + t.km, 0);
          const amt = round2(mine.reduce((s, t) => s + t.amount, 0));
          const calKm = all.filter((t) => t.member_id === m.id && t.trip_on.startsWith(String(calYear))).reduce((s, t) => s + t.km, 0);
          const open = all.filter((t) => t.member_id === m.id && !t.reimbursed);
          const openAmt = round2(open.reduce((s, t) => s + t.amount, 0));
          return (
            <Card key={m.id}>
              <div className="flex items-center gap-2.5">
                <Avatar name={m.full_name} color={m.color} initials={m.initials} size={28} />
                <span className="flex-1 text-subhead font-semibold">{m.full_name.split(' ')[0]}</span>
                <span className="text-footnote text-label-2">{range.label}</span>
              </div>
              <div className="mt-3 flex items-end gap-6">
                <div><div className="tabular text-title2 font-semibold">{km.toLocaleString('en-CA', { maximumFractionDigits: 1 })} km</div><div className="text-footnote text-label-2">{plural(mine.length, 'trip')}</div></div>
                <div><div className="tabular text-title2 font-semibold">{money(amt)}</div><div className="text-footnote text-label-2">allowance</div></div>
              </div>
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={5000} aria-valuenow={Math.min(5000, calKm)} aria-label={`${calYear} km toward the 5,000 km tier`}>
                  <div className="h-full rounded-full bg-[var(--chart-in)]" style={{ width: `${Math.min(100, (calKm / 5000) * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-caption text-label-2">
                  {calYear}: {calKm.toLocaleString('en-CA', { maximumFractionDigits: 1 })} of 5,000 km at {money(profile.mileage_rate)}/km · then {money(profile.mileage_rate_after_5000)}/km
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 pt-3 hairline-t">
                <span className="text-footnote text-label-2">{open.length ? `${money(openAmt)} not reimbursed` : 'All trips reimbursed'}</span>
                <ReimburseButton memberId={m.id} name={m.full_name.split(' ')[0]!} tripIds={open.map((t) => t.id)} amount={openAmt} accountId={bank.data?.id ?? null} today={isoToday()} />
              </div>
            </Card>
          );
        })}
      </div>

      <MileageView
        key={sp.new === '1' ? 'new' : 'list'}
        trips={shown}
        members={members}
        projects={must(projects)}
        routes={routes}
        meId={me.id}
        today={isoToday()}
        openNew={sp.new === '1'}
        closeHref={hrefWith('/mileage', params, {})}
        rate={num(profile.mileage_rate)}
        rateAfter={num(profile.mileage_rate_after_5000)}
      />
    </Page>
  );
}
