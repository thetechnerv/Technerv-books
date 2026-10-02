import Link from 'next/link';
import { subDays } from 'date-fns';
import { History, ListFilter, Check } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Avatar } from '@/components/ui/avatar';
import { LinkSegmented } from '@/components/ui/segmented';
import { Menu } from '@/components/ui/menu';
import { EmptyState } from '@/components/ui/empty';
import { db, must } from '@/lib/db';
import { allMembers, businessProfile } from '@/lib/session';
import { plural } from '@/lib/format';

export const metadata = { title: 'Activity' };

const ENTITIES: Record<string, { label: string; noun: string; href: (id: string) => string }> = {
  invoices: { label: 'Invoices & estimates', noun: 'invoice', href: (id) => `/invoices/${id}` },
  payments: { label: 'Payments', noun: 'payment', href: () => '/payments' },
  expenses: { label: 'Expenses', noun: 'expense', href: (id) => `/expenses/${id}` },
  clients: { label: 'Clients', noun: 'client', href: (id) => `/clients/${id}` },
  projects: { label: 'Projects', noun: 'project', href: () => '/clients' },
  member_transfers: { label: 'Owner transfers', noun: 'transfer', href: () => '/balances' },
  mileage_trips: { label: 'Trips', noun: 'trip', href: () => '/mileage' },
  recurring_expenses: { label: 'Subscriptions', noun: 'subscription', href: () => '/subscriptions' },
  import_batches: { label: 'Imports', noun: 'import', href: () => '/banking' },
  other_income: { label: 'Other income', noun: 'income', href: () => '/banking' },
  documents: { label: 'Documents', noun: 'document', href: () => '/documents' },
};

const PAGE = 100;

export default async function ActivitySettings({ searchParams }: { searchParams: Promise<{ member?: string; entity?: string; limit?: string }> }) {
  const sp = await searchParams;
  const [supabase, members, profile] = await Promise.all([db(), allMembers(), businessProfile()]);
  const limit = Math.min(2000, Math.max(PAGE, Number(sp.limit) || PAGE));
  const member = sp.member && (sp.member === 'system' || members.some((m) => m.id === sp.member)) ? sp.member : 'all';
  const entity = sp.entity && ENTITIES[sp.entity] ? sp.entity : 'all';

  let q = supabase.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, limit - 1);
  if (member === 'system') q = q.is('member_id', null);
  else if (member !== 'all') q = q.eq('member_id', member);
  if (entity !== 'all') q = q.eq('entity_type', entity);
  const res = await q;
  const rows = must(res);
  const total = res.count ?? rows.length;

  const byId = new Map(members.map((m) => [m.id, m]));
  const tz = profile.timezone;
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const today = dayKey.format(new Date());
  const yesterday = dayKey.format(subDays(new Date(), 1));
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKey.format(new Date(r.created_at));
    if (!days.has(k)) days.set(k, []);
    days.get(k)!.push(r);
  }
  const dayLabel = (k: string) => {
    if (k === today) return 'Today';
    if (k === yesterday) return 'Yesterday';
    const d = new Date(k + 'T12:00:00');
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', ...(k.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
  };

  const href = (p: { member?: string; entity?: string; limit?: number }) => {
    const s = new URLSearchParams();
    const m = p.member ?? member, e = p.entity ?? entity;
    if (m !== 'all') s.set('member', m);
    if (e !== 'all') s.set('entity', e);
    if (p.limit) s.set('limit', String(p.limit));
    const qs = s.toString();
    return `/settings/activity${qs ? `?${qs}` : ''}`;
  };

  return (
    <Page
      title="Activity"
      subtitle={`${total.toLocaleString('en-CA')} ${total === 1 ? 'change' : 'changes'}`}
      back={{ href: '/settings', label: 'Settings' }}
      toolbar={
        <div className="flex items-center gap-2">
          <LinkSegmented
            id="activity-member"
            value={member}
            options={[
              { value: 'all', label: 'Everyone', href: href({ member: 'all' }) },
              ...members.map((m) => ({ value: m.id, label: m.full_name.split(' ')[0]!, href: href({ member: m.id }) })),
              { value: 'system', label: 'System', href: href({ member: 'system' }) },
            ]}
          />
          <span className="flex-1" />
          <Menu
            label="Filter by record type"
            trigger={
              <button type="button" className="pressable flex h-[34px] items-center gap-1.5 rounded-full bg-fill px-3 text-subhead font-medium lg:h-7 lg:text-footnote">
                <ListFilter className="size-4" />
                <span className="max-w-[9rem] truncate">{entity === 'all' ? 'All records' : ENTITIES[entity]!.label}</span>
              </button>
            }
            items={[
              { label: 'All records', href: href({ entity: 'all' }), icon: entity === 'all' ? <Check /> : undefined },
              'separator',
              ...Object.entries(ENTITIES).map(([k, v]) => ({ label: v.label, href: href({ entity: k }), icon: entity === k ? <Check /> : undefined })),
            ]}
          />
        </div>
      }
    >
      <div className="lg:max-w-[720px]">
        {rows.length === 0 && (
          <EmptyState icon={<History />} title="No activity" message="Nothing matches these filters yet." action={<Link href="/settings/activity" className="font-medium text-accent-text">Clear filters</Link>} />
        )}
        {[...days].map(([k, list]) => (
          <Section key={k} title={dayLabel(k)} inset={60}>
            {list.map((a) => {
              const m = a.member_id ? byId.get(a.member_id) : null;
              const meta = ENTITIES[a.entity_type];
              const link = a.action !== 'delete' && a.entity_id && meta ? meta.href(a.entity_id) : undefined;
              return (
                <Row
                  key={a.id}
                  href={link}
                  icon={m ? <Avatar name={m.full_name} color={m.color} initials={m.initials} size={30} /> : <IconTile color="var(--fill-3)" fg="var(--label-2)"><History /></IconTile>}
                  title={<><span className="font-medium">{m?.full_name.split(' ')[0] ?? 'System'}</span> <span className="text-label-2">{verb(a.action, meta?.noun ?? a.entity_type)}</span> {a.summary}</>}
                  subtitle={meta?.label ?? a.entity_type}
                  value={time.format(new Date(a.created_at))}
                />
              );
            })}
          </Section>
        ))}
        {rows.length < total && (
          <div className="flex flex-col items-center gap-1 pb-4">
            <Link href={href({ limit: limit + PAGE })} scroll={false} className="pressable rounded-full bg-fill px-4 py-2 text-subhead font-medium text-accent-text">Show more</Link>
            <span className="text-footnote text-label-3">Showing {plural(rows.length, 'change')} of {total.toLocaleString('en-CA')}</span>
          </div>
        )}
      </div>
    </Page>
  );
}

function verb(action: string, noun: string) {
  if (action === 'sent') return `sent ${noun}`;
  if (action === 'insert') return noun === 'payment' ? 'recorded payment' : noun === 'import' ? 'imported' : `added ${noun}`;
  if (action === 'update') return `updated ${noun}`;
  if (action === 'delete') return `deleted ${noun}`;
  return action;
}
