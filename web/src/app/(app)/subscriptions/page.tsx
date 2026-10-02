import { addDays, format } from 'date-fns';
import { Page } from '@/components/ui/page';
import { SubscriptionsView, type Sub } from '@/components/expenses/subscriptions';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { latestRate } from '@/lib/finance';
import { money, num, round2, isoToday, plural } from '@/lib/format';
import type { Frequency } from './actions';

export const metadata = { title: 'Subscriptions' };

const PER_MONTH: Record<Frequency, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export default async function SubscriptionsPage() {
  const [me, supabase] = await Promise.all([currentMember(), db()]);
  const [subsRes, logsRes, cats, accounts, members, projects, usd] = await Promise.all([
    supabase.from('recurring_expenses').select('*, categories(name, icon), members(full_name, initials, color), money_accounts(name, kind)').order('next_on'),
    supabase.from('expenses').select('recurring_expense_id, spent_on, total').not('recurring_expense_id', 'is', null).order('spent_on', { ascending: false }),
    supabase.from('categories').select('id, name, icon').eq('kind', 'expense').eq('archived', false).order('sort'),
    supabase.from('money_accounts').select('id, name, kind, owner_member_id').eq('archived', false).order('kind'),
    supabase.from('members').select('id, full_name, initials, color').eq('active', true).order('full_name'),
    supabase.from('projects').select('id, name').neq('status', 'done').order('name'),
    latestRate('USD'),
  ]);
  const today = isoToday();
  const weekOut = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const logs = must(logsRes);
  const byRec = new Map<string, { date: string; amount: number }[]>();
  for (const l of logs) {
    const list = byRec.get(l.recurring_expense_id!) ?? [];
    list.push({ date: l.spent_on, amount: num(l.total) });
    byRec.set(l.recurring_expense_id!, list);
  }

  const subs: Sub[] = must(subsRes).map((r) => {
    const fx = r.currency === 'USD' ? usd : 1;
    const monthly = round2(num(r.amount) * fx * PER_MONTH[r.frequency as Frequency]);
    const hist = byRec.get(r.id) ?? [];
    const [last, prev] = hist;
    const cat = r.categories as { name: string; icon: string | null } | null;
    const acct = r.money_accounts as { name: string; kind: string } | null;
    return {
      id: r.id, vendor: r.vendor, description: r.description, category_id: r.category_id, category_icon: cat?.icon ?? null, category_name: cat?.name ?? null,
      spent_by: r.spent_by, member: r.members as Sub['member'], paid_from_account_id: r.paid_from_account_id, paid_from_name: acct?.name ?? '', paid_from_kind: acct?.kind ?? '',
      nature: r.nature, business_pct: num(r.business_pct), currency: r.currency === 'USD' ? 'USD' : 'CAD', amount: num(r.amount), gst_hst: num(r.gst_hst), pst: num(r.pst),
      frequency: r.frequency as Frequency, next_on: r.next_on, active: r.active, project_id: r.project_id, notes: r.notes,
      monthlyCad: monthly, annualCad: round2(monthly * 12), due: r.next_on <= weekOut, overdue: r.next_on < today,
      lastLogged: last ?? null, priceChange: last && prev && Math.abs(last.amount - prev.amount) >= 0.01 ? { from: prev.amount, to: last.amount } : null, logCount: hist.length,
    };
  });

  const active = subs.filter((s) => s.active);
  const monthly = round2(active.reduce((s, x) => s + x.monthlyCad, 0));
  const businessMonthly = round2(active.reduce((s, x) => s + x.monthlyCad * (x.nature === 'personal' ? 0 : x.business_pct) / 100, 0));
  const dueCount = active.filter((s) => s.due).length;

  return (
    <Page title="Subscriptions" subtitle={`${plural(active.length, 'active plan')} · ${money(monthly)}/mo`}>
      {subs.length > 0 && (
        <div className="-mx-4 mb-7 flex gap-2.5 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
          <Stat label="Per month" value={money(monthly)} detail={`USD at ${usd.toFixed(4)} (latest BoC)`} />
          <Stat label="Per year" value={money(monthly * 12, 'CAD', { cents: false })} detail={`${money(businessMonthly * 12, 'CAD', { cents: false })} business share`} />
          <Stat label="Due this week" value={String(dueCount)} detail={dueCount ? 'Tap Log when the charge posts' : 'Nothing due'} tone={dueCount ? 'orange' : undefined} />
        </div>
      )}
      <SubscriptionsView
        subs={subs}
        today={today}
        meId={me.id}
        opts={{ categories: must(cats), accounts: must(accounts), members: must(members), projects: must(projects) }}
      />
    </Page>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'orange' }) {
  return (
    <div className="w-[44%] min-w-[150px] shrink-0 rounded-group bg-cell p-3.5 shadow-card lg:w-auto">
      <div className="text-footnote font-medium text-label-2">{label}</div>
      <div className={`tabular mt-0.5 text-title3 font-semibold ${tone === 'orange' ? 'text-orange' : ''}`}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-caption text-label-3">{detail}</div>}
    </div>
  );
}
