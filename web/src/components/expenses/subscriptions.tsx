'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Plus, Repeat, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Input, Select, Toggle, Chips, AmountInput, Switch, TextArea } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { money, relativeDay } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CategoryTile } from './category-icon';
import { backCalc, type Nature, type TaxPreset } from './math';
import {
  saveSubscription, setSubscriptionActive, deleteSubscription, logSubscriptionCharge, undoLogCharge, type Frequency, type SubscriptionInput,
} from '@/app/(app)/subscriptions/actions';

export type Sub = {
  id: string; vendor: string; description: string | null; category_id: string | null; category_icon: string | null; category_name: string | null;
  spent_by: string; member: { full_name: string; initials: string | null; color: string | null } | null;
  paid_from_account_id: string; paid_from_name: string; paid_from_kind: string; nature: Nature; business_pct: number;
  currency: 'CAD' | 'USD'; amount: number; gst_hst: number; pst: number; frequency: Frequency; next_on: string; active: boolean;
  project_id: string | null; notes: string | null; monthlyCad: number; annualCad: number; due: boolean; overdue: boolean;
  lastLogged: { date: string; amount: number } | null; priceChange: { from: number; to: number } | null; logCount: number;
};
type Opts = {
  categories: { id: string; name: string; icon: string | null }[];
  accounts: { id: string; name: string; kind: string; owner_member_id: string | null }[];
  members: { id: string; full_name: string; initials: string | null; color: string | null }[];
  projects: { id: string; name: string }[];
};

const FREQ: { value: Frequency; label: string; per: string }[] = [
  { value: 'weekly', label: 'Weekly', per: '/wk' }, { value: 'monthly', label: 'Monthly', per: '/mo' },
  { value: 'quarterly', label: 'Quarterly', per: '/qtr' }, { value: 'yearly', label: 'Yearly', per: '/yr' },
];

export function SubscriptionsView({ subs, opts, today, meId }: { subs: Sub[]; opts: Opts; today: string; meId: string }) {
  const [editing, setEditing] = useState<Sub | 'new' | null>(null);
  const [logging, setLogging] = useState<Sub | null>(null);
  const due = subs.filter((s) => s.active && s.due);
  const active = subs.filter((s) => s.active && !s.due);
  const paused = subs.filter((s) => !s.active);

  return (
    <>
      {subs.length === 0 ? (
        <EmptyState icon={<Repeat />} title="No subscriptions yet" message="Track software, phone and hosting plans so each month’s charge is one tap to log." action={<Button variant="filled" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add subscription</Button>} />
      ) : (
        <>
          {due.length > 0 && <Group title="Due this week" subs={due} onOpen={setEditing} onLog={setLogging} highlight />}
          {active.length > 0 && <Group title="Active" subs={active} onOpen={setEditing} onLog={setLogging} />}
          {paused.length > 0 && <Group title="Paused" subs={paused} onOpen={setEditing} onLog={setLogging} />}
          <div className="flex justify-center">
            <Button variant="tinted" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add subscription</Button>
          </div>
        </>
      )}
      <EditSheet key={editing === 'new' ? 'new' : editing?.id ?? 'none'} sub={editing} opts={opts} meId={meId} today={today} onClose={() => setEditing(null)} onLog={(s) => { setEditing(null); setLogging(s); }} />
      <LogSheet key={logging?.id ?? 'none-log'} sub={logging} today={today} onClose={() => setLogging(null)} />
    </>
  );
}

function Group({ title, subs, onOpen, onLog, highlight }: { title: string; subs: Sub[]; onOpen: (s: Sub) => void; onLog: (s: Sub) => void; highlight?: boolean }) {
  const total = subs.reduce((s, x) => s + x.monthlyCad, 0);
  return (
    <Section title={title} inset={58} action={<span className="tabular text-footnote text-label-2">{money(total)}/mo</span>}>
      {subs.map((s) => <SubRow key={s.id} s={s} onOpen={() => onOpen(s)} onLog={() => onLog(s)} highlight={highlight} />)}
    </Section>
  );
}

function SubRow({ s, onOpen, onLog, highlight }: { s: Sub; onOpen: () => void; onLog: () => void; highlight?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(s.active);
  const [, start] = useTransition();
  const per = FREQ.find((f) => f.value === s.frequency)!.per;
  async function flip(v: boolean) {
    setOn(v);
    const r = await setSubscriptionActive(s.id, v);
    if (!r.ok) { setOn(!v); return toast({ title: r.error, tone: 'error' }); }
    toast({ title: v ? `${s.vendor} resumed` : `${s.vendor} paused`, action: { label: 'Undo', onClick: () => { setSubscriptionActive(s.id, !v).then(() => router.refresh()); setOn(!v); } } });
    start(() => router.refresh());
  }
  return (
    <div className={cn('flex min-h-[64px] items-center gap-3 px-4 lg:min-h-[52px] lg:px-3', !s.active && 'opacity-60')}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <CategoryTile icon={s.category_icon} />
        <span className="min-w-0 flex-1 py-2">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body">{s.vendor}</span>
            {s.priceChange && (
              <Badge tone={s.priceChange.to > s.priceChange.from ? 'orange' : 'accent'}>
                {s.priceChange.to > s.priceChange.from ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {money(s.priceChange.to - s.priceChange.from, s.currency, { sign: true })}
              </Badge>
            )}
            {s.nature === 'mixed' && <Badge tone="blue">{s.business_pct}% biz</Badge>}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-subhead text-label-2">
            <span className="truncate">
              {s.active ? (s.overdue ? `Was due ${relativeDay(s.next_on)}` : `Next ${relativeDay(s.next_on)}`) : 'Paused'} · {s.paid_from_kind === 'personal' ? 'Personal money' : s.paid_from_name}
            </span>
            {s.member && <Avatar name={s.member.full_name} color={s.member.color} initials={s.member.initials} size={16} />}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end text-right">
          <span className="tabular text-body font-medium">{money(s.amount, s.currency)}<span className="text-footnote font-normal text-label-3">{per}</span></span>
          <span className="tabular mt-0.5 text-footnote text-label-3">{money(s.annualCad, 'CAD', { cents: false })}/yr</span>
        </span>
      </button>
      {highlight && s.active ? (
        <Button variant="tinted" size="sm" onClick={onLog}>Log</Button>
      ) : (
        <Switch on={on} onChange={flip} label={`${s.vendor} active`} />
      )}
    </div>
  );
}

function LogSheet({ sub, today, onClose }: { sub: Sub | null; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [date, setDate] = useState(sub ? (sub.next_on <= today ? sub.next_on : today) : today);
  const [amount, setAmount] = useState(sub?.amount ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function log() {
    if (!sub) return;
    setBusy(true); setError(null);
    const prev = { next_on: sub.next_on, amount: sub.amount, gst_hst: sub.gst_hst, pst: sub.pst };
    const r = await logSubscriptionCharge(sub.id, { date, amount });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast({
      title: `${sub.vendor} logged · next ${format(parseISO(r.data!.nextOn), 'MMM d')}${r.data!.priceChanged ? ' · new price saved' : ''}`,
      action: { label: 'Undo', onClick: () => { undoLogCharge(sub.id, r.data!.expenseId, prev).then(() => router.refresh()); } },
    });
    onClose();
    start(() => router.refresh());
  }
  return (
    <Sheet open={!!sub} onClose={onClose} title="Log charge" fit size="sm" action={<SheetAction loading={busy} onClick={log}>Log</SheetAction>}>
      {sub && (
        <form onSubmit={(e) => { e.preventDefault(); log(); }}>
          <div className="mb-2 flex flex-col items-center pt-2 text-center">
            <CategoryTile icon={sub.category_icon} size={44} />
            <p className="mt-2 text-headline font-semibold">{sub.vendor}</p>
            <p className="text-footnote text-label-2">{sub.description}</p>
          </div>
          <Section>
            <AmountInput name="amount" currency={sub.currency} defaultValue={sub.amount.toFixed(2)} onValue={setAmount} autoFocus />
          </Section>
          <Section footer={amount && Math.abs(amount - sub.amount) >= 0.01 ? `Price changed from ${money(sub.amount, sub.currency)} — future charges will use ${money(amount, sub.currency)}.` : `Creates the expense on ${sub.paid_from_name} and moves the next charge forward.`}>
            <Input label="Charged on" type="date" align="right" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Section>
          {error && <p className="rounded-[12px] bg-red-soft px-3 py-2.5 text-subhead text-red">{error}</p>}
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}

function EditSheet({ sub, opts, meId, today, onClose, onLog }: { sub: Sub | 'new' | null; opts: Opts; meId: string; today: string; onClose: () => void; onLog: (s: Sub) => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const s = sub && sub !== 'new' ? sub : null;
  const defaultAccount = opts.accounts.find((a) => a.kind === 'credit_card')?.id ?? opts.accounts[0]?.id ?? '';
  const [v, setV] = useState<SubscriptionInput>(() => ({
    vendor: s?.vendor ?? '', description: s?.description ?? '', category_id: s?.category_id ?? opts.categories[0]?.id ?? null,
    spent_by: s?.spent_by ?? meId, paid_from_account_id: s?.paid_from_account_id ?? defaultAccount, nature: s?.nature ?? 'business',
    business_pct: s?.business_pct ?? 100, currency: s?.currency ?? 'CAD', amount: s?.amount ?? 0, gst_hst: s?.gst_hst ?? 0, pst: s?.pst ?? 0,
    frequency: s?.frequency ?? 'monthly', next_on: s?.next_on ?? today, active: s?.active ?? true, project_id: s?.project_id ?? null, notes: s?.notes ?? '',
  }));
  const set = (p: Partial<SubscriptionInput>) => setV((x) => ({ ...x, ...p }));
  const [gstText, setGstText] = useState(v.gst_hst ? v.gst_hst.toFixed(2) : '');
  const [pstText, setPstText] = useState(v.pst ? v.pst.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyPreset = (p: TaxPreset, amt = v.amount) => {
    const b = backCalc(amt, p);
    if (!b) return;
    set({ gst_hst: b.gstHst, pst: b.pst });
    setGstText(b.gstHst ? b.gstHst.toFixed(2) : '');
    setPstText(b.pst ? b.pst.toFixed(2) : '');
  };
  const accounts = opts.accounts.filter((a) => a.kind !== 'personal' || a.owner_member_id === v.spent_by);

  async function save() {
    setBusy(true); setError(null);
    const r = await saveSubscription(s?.id ?? null, v);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast({ title: s ? 'Subscription saved' : `${v.vendor} added` });
    onClose();
    start(() => router.refresh());
  }
  async function remove() {
    if (!s) return;
    if (!(await confirm({ title: `Delete ${s.vendor}?`, message: 'Charges already logged stay in Expenses.', confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteSubscription(s.id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Subscription deleted' });
    onClose();
    start(() => router.refresh());
  }

  return (
    <Sheet open={!!sub} onClose={onClose} title={s ? s.vendor : 'New subscription'} action={<SheetAction loading={busy} onClick={save}>{s ? 'Save' : 'Add'}</SheetAction>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        {s && s.active && (
          <Button type="button" variant="filled" size="lg" block className="mb-5 mt-1" icon={<Repeat className="size-4" />} onClick={() => onLog(s)}>
            Log this month’s charge
          </Button>
        )}
        <Section>
          <AmountInput name="amount" currency={v.currency} defaultValue={v.amount ? v.amount.toFixed(2) : ''} onValue={(n) => set({ amount: n })} />
          <div className="flex justify-center pb-4">
            <Segmented options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]} value={v.currency} onChange={(c) => set({ currency: c as 'CAD' | 'USD' })} />
          </div>
        </Section>
        <Section>
          <Input label="Vendor" align="right" placeholder="e.g. Figma" value={v.vendor} onChange={(e) => set({ vendor: e.target.value })} />
          <Input label="Plan" align="right" placeholder="Optional" value={v.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
          <Select label="Category" value={v.category_id ?? ''} options={opts.categories.map((c) => ({ value: c.id, label: c.name }))} onChange={(e) => set({ category_id: e.target.value || null })} />
        </Section>
        <Section title="Schedule">
          <div className="p-3"><Segmented full options={FREQ.map((f) => ({ value: f.value, label: f.label }))} value={v.frequency} onChange={(f) => set({ frequency: f as Frequency })} /></div>
          <Input label="Next charge" type="date" align="right" value={v.next_on} onChange={(e) => e.target.value && set({ next_on: e.target.value })} />
          <Toggle label="Active" checked={v.active} onChange={(a) => set({ active: a })} />
        </Section>
        <Section title="Who pays">
          <div className="space-y-3 p-3">
            <Segmented full options={opts.members.map((m) => ({ value: m.id, label: <span className="flex items-center gap-1.5"><Avatar name={m.full_name} color={m.color} initials={m.initials} size={18} />{m.full_name.split(' ')[0]}</span> }))}
              value={v.spent_by}
              onChange={(id) => { const own = opts.accounts.find((a) => a.id === v.paid_from_account_id); set({ spent_by: id, ...(own?.kind === 'personal' ? { paid_from_account_id: opts.accounts.find((a) => a.kind === 'personal' && a.owner_member_id === id)?.id ?? defaultAccount } : {}) }); }} />
            <Chips options={accounts.map((a) => ({ value: a.id, label: a.kind === 'personal' ? `${a.name.split(' ')[0]} — personal` : a.name }))} value={v.paid_from_account_id} onChange={(id) => set({ paid_from_account_id: id })} />
          </div>
        </Section>
        <Section title="What it’s for">
          <div className="p-3">
            <Segmented full options={[{ value: 'business', label: 'Business' }, { value: 'personal', label: 'Personal' }, { value: 'mixed', label: 'Mixed' }]} value={v.nature}
              onChange={(n) => set({ nature: n as Nature, business_pct: n === 'mixed' ? 60 : n === 'business' ? 100 : 0 })} />
          </div>
          {v.nature === 'mixed' && (
            <Input label="Business share" inputMode="numeric" align="right" trailing="%" value={String(v.business_pct)} onChange={(e) => set({ business_pct: Math.min(99, Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1))) })} />
          )}
        </Section>
        <Section title="Tax per charge">
          <div className="p-3 pb-1">
            <Chips options={[{ value: 'gst', label: 'GST 5%' }, { value: 'bc', label: 'GST + PST' }, { value: 'hst13', label: 'HST 13%' }, { value: 'none', label: 'No tax' }]} value={'' as TaxPreset} onChange={(p) => applyPreset(p as TaxPreset)} />
          </div>
          <Input label="GST/HST" inputMode="decimal" align="right" placeholder="0.00" value={gstText} onChange={(e) => { setGstText(e.target.value); set({ gst_hst: Number(e.target.value) || 0 }); }} />
          <Input label="PST" inputMode="decimal" align="right" placeholder="0.00" value={pstText} onChange={(e) => { setPstText(e.target.value); set({ pst: Number(e.target.value) || 0 }); }} />
        </Section>
        <Section>
          <Select label="Project" value={v.project_id ?? ''} placeholder="None" options={opts.projects.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => set({ project_id: e.target.value || null })} />
          <TextArea label="Notes" rows={2} value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Section>
        {s && (
          <p className="mb-4 px-1 text-footnote text-label-2">
            {s.logCount ? `${s.logCount} charges logged${s.lastLogged ? ` · last ${format(parseISO(s.lastLogged.date), 'MMM d, yyyy')} for ${money(s.lastLogged.amount, s.currency)}` : ''}.` : 'No charges logged yet.'}
          </p>
        )}
        {error && <p className="mb-4 rounded-[12px] bg-red-soft px-3 py-2.5 text-subhead text-red">{error}</p>}
        {s && <Button type="button" variant="destructive-tinted" block icon={<Trash2 className="size-4" />} onClick={remove}>Delete subscription</Button>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
