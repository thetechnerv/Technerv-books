'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Car, Plus, Trash2, HandCoins } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Input, Select, Toggle } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { saveTrip, deleteTrip, type TripInput } from '@/app/(app)/mileage/actions';
import { settleUp, deleteTransfer } from '@/app/(app)/balances/actions';

export type Trip = {
  id: string; member_id: string; trip_on: string; origin: string | null; destination: string | null; purpose: string; km: number;
  rate_per_km: number; round_trip: boolean; project_id: string | null; reimbursed: boolean; amount: number;
};
type Member = { id: string; full_name: string; initials: string | null; color: string | null };
export type Route = { origin: string | null; destination: string; kmOneWay: number; roundTrip: boolean; purpose: string; times: number };

export function MileageView({ trips, members, projects, routes, meId, today, openNew, closeHref, rate, rateAfter }: {
  trips: Trip[]; members: Member[]; projects: { id: string; name: string }[]; routes: Route[]; meId: string; today: string;
  openNew: boolean; closeHref: string; rate: number; rateAfter: number;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<Trip | 'new' | null>(openNew ? 'new' : null);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const groups = new Map<string, Trip[]>();
  for (const t of trips) {
    const k = t.trip_on.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const close = () => {
    setEditing(null);
    if (openNew) start(() => router.replace(closeHref, { scroll: false }));
  };

  return (
    <>
      {trips.length === 0 ? (
        <EmptyState icon={<Car />} title="No trips in this period" message={`Log business driving in your own vehicle — CRA allows $${rate.toFixed(2)}/km for the first 5,000 km each year and $${rateAfter.toFixed(2)} after.`}
          action={<Button variant="filled" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add trip</Button>} />
      ) : (
        [...groups.entries()].map(([k, list]) => (
          <Section key={k} title={format(parseISO(k + '-01'), 'MMMM yyyy')} inset={58}
            action={<span className="tabular text-footnote text-label-2">{list.reduce((s, t) => s + t.km, 0).toLocaleString('en-CA', { maximumFractionDigits: 1 })} km · {money(list.reduce((s, t) => s + t.amount, 0))}</span>}>
            {list.map((t) => {
              const m = byId[t.member_id];
              return (
                <button key={t.id} type="button" onClick={() => setEditing(t)} className="row-press flex min-h-[64px] w-full items-center gap-3 px-4 text-left lg:min-h-[52px] lg:px-3">
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-blue-soft text-blue"><Car className="size-4" strokeWidth={2.1} /></span>
                  <span className="min-w-0 flex-1 py-2">
                    <span className="flex items-center gap-1.5"><span className="truncate text-body">{t.destination || 'Trip'}</span>{!t.reimbursed && <Badge tone="orange">Open</Badge>}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-subhead text-label-2">
                      <span className="truncate">{format(parseISO(t.trip_on), 'MMM d')} · {t.purpose}{t.round_trip ? ' · round trip' : ''}</span>
                      {m && <Avatar name={m.full_name} color={m.color} initials={m.initials} size={16} />}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-right">
                    <span className="tabular text-body font-medium">{money(t.amount)}</span>
                    <span className="tabular mt-0.5 text-footnote text-label-3">{t.km.toLocaleString('en-CA')} km</span>
                  </span>
                </button>
              );
            })}
          </Section>
        ))
      )}
      <TripSheet key={editing === 'new' ? 'new' : editing?.id ?? 'none'} trip={editing} members={members} projects={projects} routes={routes} meId={meId} today={today} onClose={close} />
    </>
  );
}

function TripSheet({ trip, members, projects, routes, meId, today, onClose }: {
  trip: Trip | 'new' | null; members: Member[]; projects: { id: string; name: string }[]; routes: Route[]; meId: string; today: string; onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const t = trip && trip !== 'new' ? trip : null;
  const [v, setV] = useState<TripInput>(() => ({
    member_id: t?.member_id ?? meId, trip_on: t?.trip_on ?? today, origin: t?.origin ?? routes[0]?.origin ?? '', destination: t?.destination ?? '',
    purpose: t?.purpose ?? '', km_one_way: t ? (t.round_trip ? t.km / 2 : t.km) : 0, round_trip: t?.round_trip ?? true, project_id: t?.project_id ?? null,
    reimbursed: t?.reimbursed,
  }));
  const [kmText, setKmText] = useState(v.km_one_way ? String(v.km_one_way) : '');
  const set = (p: Partial<TripInput>) => setV((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalKm = Math.round((Number(kmText) || 0) * (v.round_trip ? 2 : 1) * 10) / 10;

  async function save() {
    setBusy(true); setError(null);
    const r = await saveTrip(t?.id ?? null, { ...v, km_one_way: Number(kmText) || 0 });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast({ title: `${r.data!.km} km · ${money(r.data!.km * r.data!.rate)} ${t ? 'saved' : 'logged'}` });
    onClose();
    start(() => router.refresh());
  }
  async function remove() {
    if (!t) return;
    if (!(await confirm({ title: 'Delete this trip?', message: `${t.destination} · ${t.km} km`, confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteTrip(t.id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Trip deleted' });
    onClose();
    start(() => router.refresh());
  }

  return (
    <Sheet open={!!trip} onClose={onClose} title={t ? 'Trip' : 'New trip'} action={<SheetAction loading={busy} onClick={save}>{t ? 'Save' : 'Add'}</SheetAction>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!t && routes.length > 0 && (
          <Section title="Frequent routes">
            <div className="no-scrollbar flex gap-2 overflow-x-auto p-3">
              {routes.map((r) => (
                <button key={`${r.origin}>${r.destination}`} type="button"
                  onClick={() => { set({ origin: r.origin ?? '', destination: r.destination, round_trip: r.roundTrip, purpose: v.purpose || r.purpose }); setKmText(String(r.kmOneWay)); }}
                  className={cn('pressable flex shrink-0 flex-col items-start rounded-[12px] px-3 py-2 text-left', v.destination === r.destination ? 'bg-label text-bg' : 'bg-fill text-label')}>
                  <span className="max-w-[180px] truncate text-subhead font-medium">{r.destination}</span>
                  <span className="text-caption opacity-70">{r.kmOneWay} km{r.roundTrip ? ' each way' : ''} · {r.times}×</span>
                </button>
              ))}
            </div>
          </Section>
        )}
        <Section>
          <Input label="Date" type="date" align="right" value={v.trip_on} onChange={(e) => e.target.value && set({ trip_on: e.target.value })} />
          <Input label="From" align="right" placeholder="Start" value={v.origin} onChange={(e) => set({ origin: e.target.value })} />
          <Input label="To" align="right" placeholder="Destination" value={v.destination} onChange={(e) => set({ destination: e.target.value })} />
          <Input label="Purpose" align="right" placeholder="e.g. Client meeting" value={v.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        </Section>
        <Section footer={totalKm > 0 ? `${totalKm.toLocaleString('en-CA')} km logged${v.round_trip ? ' (there and back)' : ''}. The rate is set by how far you’ve driven this calendar year.` : 'Distance one way — round trip doubles it.'}>
          <Input label="Distance" inputMode="decimal" align="right" placeholder="0" trailing="km" value={kmText} onChange={(e) => setKmText(e.target.value.replace(/[^\d.]/g, ''))} />
          <Toggle label="Round trip" checked={v.round_trip} onChange={(b) => set({ round_trip: b })} />
        </Section>
        <Section title="Driver">
          <div className="p-3">
            <Segmented full options={members.map((m) => ({ value: m.id, label: <span className="flex items-center gap-1.5"><Avatar name={m.full_name} color={m.color} initials={m.initials} size={18} />{m.full_name.split(' ')[0]}</span> }))} value={v.member_id} onChange={(id) => set({ member_id: id })} />
          </div>
        </Section>
        <Section>
          <Select label="Project" value={v.project_id ?? ''} placeholder="None" options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => set({ project_id: e.target.value || null })} />
          {t && <Toggle label="Reimbursed" hint="Only flips the flag. To pay it out, use Reimburse or Settle up so the balance moves." checked={!!v.reimbursed} onChange={(b) => set({ reimbursed: b })} />}
        </Section>
        {error && <p className="mb-4 rounded-[12px] bg-red-soft px-3 py-2.5 text-subhead text-red">{error}</p>}
        {t && <Button type="button" variant="destructive-tinted" block icon={<Trash2 className="size-4" />} onClick={remove}>Delete trip</Button>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

/** Pays out every open trip for a member as one reimbursement (with undo). */
export function ReimburseButton({ memberId, name, tripIds, amount, accountId, today }: { memberId: string; name: string; tripIds: string[]; amount: number; accountId: string | null; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  async function go() {
    setBusy(true);
    const r = await settleUp({ memberId, kind: 'reimbursement', amount, date: today, accountId, notes: `Mileage — ${tripIds.length} trips`, expenseIds: [], tripIds });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    const id = r.data!.transferId;
    toast({ title: `Reimbursed ${name} ${money(amount)}`, action: id ? { label: 'Undo', onClick: () => { deleteTransfer(id).then(() => router.refresh()); } } : undefined });
    start(() => router.refresh());
  }
  if (!tripIds.length) return null;
  return <Button variant="tinted" size="sm" loading={busy} icon={<HandCoins className="size-4" />} onClick={go}>Reimburse {money(amount)}</Button>;
}
