import Link from 'next/link';
import { ArrowDown, ArrowUp, Download, Plus, Users, SearchX, Archive, HandCoins } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card } from '@/components/ui/group';
import { Button, IconButton } from '@/components/ui/button';
import { Money, BigMoney } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/empty';
import { currentMember, businessProfile } from '@/lib/session';
import { money, plural, shortDate, date } from '@/lib/format';
import { cn } from '@/lib/cn';
import { loadClientSummaries, type ClientSummary } from '@/components/clients/data';
import { formatLocation } from '@/components/clients/format';
import { ClientTile } from '@/components/clients/client-tile';
import { ClientsToolbar } from '@/components/clients/clients-toolbar';
import { taxLabel } from '@/components/clients/tax';
import { clientsHref, parseClientsQuery, type ClientsQuery, type ClientsSort } from '@/components/clients/query';

export const metadata = { title: 'Clients' };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, profile, sp] = await Promise.all([currentMember(), businessProfile(), searchParams]);
  const query = parseClientsQuery(sp);
  const { clients, fy } = await loadClientSummaries(profile.fiscal_year_end);

  const active = clients.filter((c) => !c.archived);
  const owing = clients.filter((c) => c.stats.open > 0);
  const counts = { active: active.length, owing: owing.length, archived: clients.length - active.length };
  const pool = query.filter === 'archived' ? clients.filter((c) => c.archived) : query.filter === 'owing' ? owing : active;
  const rows = sortClients(search(pool, query.q), query.sort);

  const totalOpen = owing.reduce((s, c) => s + c.stats.openCad, 0);
  const totalOverdue = owing.reduce((s, c) => s + c.stats.overdueCad, 0);
  const overdueClients = owing.filter((c) => c.stats.overdue > 0).length;

  return (
    <Page
      title="Clients"
      subtitle={plural(counts.active, 'active client')}
      wide
      actions={
        <>
          <IconButton label="Export clients as CSV" href="/api/clients/export"><Download className="size-[22px] lg:size-[18px]" strokeWidth={2} /></IconButton>
          <IconButton label="New client" href="/clients/new" className="lg:hidden"><Plus className="size-[26px]" strokeWidth={2.2} /></IconButton>
          <Button variant="filled" href="/clients/new" icon={<Plus className="size-4" strokeWidth={2.4} />} className="hidden lg:inline-flex">New client</Button>
        </>
      }
      toolbar={<ClientsToolbar query={query} counts={counts} />}
    >
      {clients.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No clients yet"
          message="Add the people and companies you bill. Their province sets the right GST/HST on every invoice."
          action={<Button variant="filled" size="lg" href="/clients/new">Add your first client</Button>}
        />
      ) : (
        <>
          {/* Header stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:mb-6 lg:max-w-[640px]">
            <Link href={clientsHref({ ...query, filter: 'owing', sort: 'outstanding' })} className="pressable">
              <Card className="h-full">
                <div className="text-footnote font-medium text-label-2">Total outstanding</div>
                <BigMoney value={totalOpen} className="mt-1 block text-title2" />
                {totalOverdue > 0
                  ? <div className="mt-0.5 text-footnote font-medium text-red">{money(totalOverdue)} overdue</div>
                  : <div className="mt-0.5 text-footnote text-label-3">Nothing overdue</div>}
              </Card>
            </Link>
            <Link href={clientsHref({ ...query, filter: 'owing' })} className="pressable">
              <Card className="h-full">
                <div className="text-footnote font-medium text-label-2">Clients with balances</div>
                <div className="tabular mt-1 font-display text-title2 font-semibold tracking-[-0.02em]">{owing.length}<span className="text-subhead font-medium text-label-3"> of {counts.active}</span></div>
                <div className={cn('mt-0.5 text-footnote', overdueClients ? 'font-medium text-red' : 'text-label-3')}>
                  {overdueClients ? `${plural(overdueClients, 'client')} overdue` : 'All on time'}
                </div>
              </Card>
            </Link>
          </div>

          {rows.length === 0 ? (
            <Empty query={query} />
          ) : (
            <>
              <PhoneList rows={rows} query={query} />
              <DesktopTable rows={rows} query={query} fyLabel={fy.label} />
            </>
          )}
        </>
      )}
    </Page>
  );
}

// ───────────────────────── Phone list ─────────────────────────

function PhoneList({ rows, query }: { rows: ClientSummary[]; query: ClientsQuery }) {
  const groups = query.sort === 'name'
    ? [...groupByLetter(rows)]
    : [[query.sort === 'outstanding' ? 'By outstanding' : query.sort === 'last' ? 'By last invoice' : query.sort === 'billed' ? 'By lifetime billed' : 'Clients', rows] as const];
  return (
    <div className="lg:hidden">
      {groups.map(([label, list]) => (
        <Section key={label} title={label} inset={68}>
          {list.map((c) => <ClientRow key={c.id} c={c} />)}
        </Section>
      ))}
    </div>
  );
}

function ClientRow({ c }: { c: ClientSummary }) {
  const s = c.stats;
  const subtitle = [formatLocation(c), c.contact_name].filter(Boolean).join(' · ');
  return (
    <Row
      href={`/clients/${c.id}`}
      icon={<ClientTile name={c.display_name} size={40} />}
      title={<span className="font-medium">{c.display_name}</span>}
      subtitle={subtitle || c.email || 'No contact details'}
    >
      <span className="flex shrink-0 flex-col items-end text-right">
        {s.open > 0 ? (
          <>
            <Money value={s.open} currency={c.currency} className={cn('font-semibold', s.overdue > 0 ? 'text-red' : 'text-label')} />
            <span className={cn('mt-0.5 text-footnote', s.overdue > 0 ? 'text-red' : 'text-label-3')}>{s.overdue > 0 ? (s.overdue === s.open ? 'Overdue' : `${money(s.overdue, c.currency, { cents: false })} overdue`) : 'Owing'}</span>
          </>
        ) : (
          <>
            <Money value={s.billed} currency={c.currency} className="text-label-2" compact={s.billed >= 100000} />
            <span className="mt-0.5 text-footnote text-label-3">{s.invoiceCount ? 'Billed' : 'No invoices'}</span>
          </>
        )}
      </span>
    </Row>
  );
}

// ───────────────────────── Desktop table ─────────────────────────

function DesktopTable({ rows, query, fyLabel }: { rows: ClientSummary[]; query: ClientsQuery; fyLabel: string }) {
  const cols: { key: ClientsSort | null; label: string; align?: 'right' }[] = [
    { key: 'name', label: 'Client' },
    { key: null, label: 'Location' },
    { key: null, label: 'Tax' },
    { key: 'outstanding', label: 'Open', align: 'right' },
    { key: 'overdue', label: 'Overdue', align: 'right' },
    { key: 'fy', label: `Billed ${fyLabel}`, align: 'right' },
    { key: 'last', label: 'Last invoice', align: 'right' },
    { key: 'days', label: 'Avg days to pay', align: 'right' },
  ];
  return (
    <div className="hidden lg:block">
      <div className="overflow-clip rounded-group bg-cell shadow-card">
        <table className="w-full border-collapse text-subhead">
          <thead className="sticky top-[104px] z-10">
            <tr className="material-bar hairline-b">
              {cols.map((col) => (
                <th key={col.label} scope="col" className={cn('px-3 py-2 text-caption font-semibold uppercase tracking-[0.04em] text-label-2', col.align === 'right' ? 'text-right' : 'text-left', col.label === 'Client' && 'pl-4')}>
                  {col.key ? (
                    <Link href={clientsHref({ ...query, sort: col.key })} scroll={false} className={cn('inline-flex items-center gap-1 hover:text-label', query.sort === col.key && 'text-label')}>
                      {col.label}
                      {query.sort === col.key && (col.key === 'name' || col.key === 'days' ? <ArrowUp className="size-3" strokeWidth={2.6} /> : <ArrowDown className="size-3" strokeWidth={2.6} />)}
                    </Link>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const s = c.stats;
              const href = `/clients/${c.id}`;
              const cell = 'px-3 py-2.5 align-middle';
              return (
                <tr key={c.id} className="group relative hairline-t first:shadow-none hover:bg-fill-2">
                  <td className={cn(cell, 'pl-4')}>
                    <Link href={href} className="flex items-center gap-3 after:absolute after:inset-0 after:content-['']">
                      <ClientTile name={c.display_name} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-label">{c.display_name}</span>
                        <span className="block truncate text-footnote text-label-2">{c.contact_name ?? c.email ?? '—'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className={cn(cell, 'text-label-2')}>{formatLocation(c) || '—'}</td>
                  <td className={cell}>
                    <span className="inline-flex h-5 items-center rounded-full bg-fill px-2 text-caption font-semibold text-label-2">{taxLabel(c.taxCode)}</span>
                    {c.currency !== 'CAD' && <span className="ml-1 inline-flex h-5 items-center rounded-full bg-blue-soft px-2 text-caption font-semibold text-blue">{c.currency}</span>}
                  </td>
                  <td className={cn(cell, 'text-right')}>{s.open ? <Money value={s.open} currency={c.currency} className="font-medium" /> : <Dash />}</td>
                  <td className={cn(cell, 'text-right')}>{s.overdue ? <Money value={s.overdue} currency={c.currency} className="font-semibold text-red" /> : <Dash />}</td>
                  <td className={cn(cell, 'text-right')}>{s.billedFy ? <Money value={s.billedFy} currency={c.currency} className="text-label-2" /> : <Dash />}</td>
                  <td className={cn(cell, 'tabular text-right text-label-2')} title={s.lastInvoiceOn ? date(s.lastInvoiceOn) : undefined}>{s.lastInvoiceOn ? shortDateOrYear(s.lastInvoiceOn) : <Dash />}</td>
                  <td className={cn(cell, 'tabular pr-4 text-right', s.avgDaysToPay !== null && s.avgDaysToPay > 30 ? 'text-orange' : 'text-label-2')}>
                    {s.avgDaysToPay === null ? <Dash /> : `${s.avgDaysToPay} ${s.avgDaysToPay === 1 ? 'day' : 'days'}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-footnote text-label-3">
        Amounts in each client’s currency. Average days to pay compares each paid invoice’s issue date with its final payment.
      </p>
    </div>
  );
}

const Dash = () => <span className="text-label-4">—</span>;

function shortDateOrYear(iso: string) {
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? shortDate(iso) : date(iso, 'MMM d, yyyy');
}

function Empty({ query }: { query: ClientsQuery }) {
  if (query.q) {
    return <EmptyState icon={<SearchX />} title="No matches" message={`No ${query.filter === 'archived' ? 'archived ' : ''}clients match “${query.q}”.`} action={<Button variant="gray" href={clientsHref({ ...query, q: '' })}>Clear search</Button>} />;
  }
  if (query.filter === 'owing') {
    return <EmptyState icon={<HandCoins />} title="Nobody owes you anything" message="Every invoice you’ve sent is paid. Nice." action={<Button variant="tinted" href="/invoices/new">New invoice</Button>} />;
  }
  if (query.filter === 'archived') {
    return <EmptyState icon={<Archive />} title="No archived clients" message="Archive clients you no longer work with. They keep their history and stay out of your way." />;
  }
  return <EmptyState icon={<Users />} title="No active clients" message="All your clients are archived." action={<Button variant="filled" href="/clients/new">New client</Button>} />;
}

// ───────────────────────── helpers ─────────────────────────

function search(list: ClientSummary[], q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((c) =>
    [c.display_name, c.company_name, c.contact_name, c.email, c.city, c.province, c.phone, ...(c.cc_emails ?? [])]
      .some((f) => f?.toLowerCase().includes(needle)));
}

function sortClients(list: ClientSummary[], sort: ClientsSort) {
  const byName = (a: ClientSummary, b: ClientSummary) => a.display_name.localeCompare(b.display_name, 'en-CA', { sensitivity: 'base' });
  const desc = (f: (c: ClientSummary) => number | string | null) => (a: ClientSummary, b: ClientSummary) => {
    const x = f(a) ?? '', y = f(b) ?? '';
    return x < y ? 1 : x > y ? -1 : byName(a, b);
  };
  const cmp = {
    name: byName,
    outstanding: desc((c) => c.stats.openCad),
    overdue: desc((c) => c.stats.overdueCad),
    fy: desc((c) => c.stats.billedFyCad),
    last: desc((c) => c.stats.lastInvoiceOn),
    billed: desc((c) => c.stats.billedCad),
    // fastest payers first; clients without paid invoices last
    days: (a: ClientSummary, b: ClientSummary) => (a.stats.avgDaysToPay ?? 9999) - (b.stats.avgDaysToPay ?? 9999) || byName(a, b),
  }[sort];
  return [...list].sort(cmp);
}

function groupByLetter(list: ClientSummary[]) {
  const m = new Map<string, ClientSummary[]>();
  for (const c of list) {
    const ch = c.display_name.trim()[0]?.toUpperCase() ?? '#';
    const k = /[A-Z]/.test(ch) ? ch : '#';
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m.entries();
}
