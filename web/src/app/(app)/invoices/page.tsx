import Link from 'next/link';
import { FileText, Repeat, SearchX } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { DocList } from '@/components/invoices/doc-list';
import { ListToolbar, NewInvoiceMenu } from '@/components/invoices/list-toolbar';
import { FilterChips, SummaryStrip } from '@/components/invoices/summary';
import { lastByClient, listDocs, matches } from '@/components/invoices/queries';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { money, num, plural, round2 } from '@/lib/format';

export const metadata = { title: 'Invoices' };

const FILTERS = ['all', 'outstanding', 'overdue', 'draft', 'paid'] as const;
type Filter = (typeof FILTERS)[number];
const AGES = [
  { key: '1-30', label: '1–30 days', min: 1, max: 30 },
  { key: '31-60', label: '31–60', min: 31, max: 60 },
  { key: '61-90', label: '61–90', min: 61, max: 90 },
  { key: '90+', label: '90+', min: 91, max: Infinity },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; age?: string }> }) {
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'all';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const [profile, supabase, all] = await Promise.all([businessProfile(), db(), listDocs(['invoice', 'credit_note'])]);

  const fy = fiscalYearOf(new Date(), profile.fiscal_year_end);
  const cur = fiscalRange(fy, profile.fiscal_year_end);
  const prev = fiscalRange(fy - 1, profile.fiscal_year_end);
  const payments = must(await supabase.from('payments').select('amount, fx_rate, received_on').gte('received_on', prev.start).lte('received_on', cur.end));
  const paidIn = (r: { start: string; end: string }) => round2(payments.filter((p) => p.received_on >= r.start && p.received_on <= r.end).reduce((s, p) => s + num(p.amount) * num(p.fx_rate), 0));

  const cad = (r: (typeof all)[number]) => r.balance * (r.fx_rate ?? 1);
  const open = all.filter((r) => r.kind === 'invoice' && (r.status === 'sent' || r.status === 'partial'));
  const overdue = open.filter((r) => r.is_overdue);
  const outstandingTotal = round2(open.reduce((s, r) => s + cad(r), 0));
  const overdueTotal = round2(overdue.reduce((s, r) => s + cad(r), 0));

  const byFilter: Record<Filter, typeof all> = {
    all,
    outstanding: open,
    overdue,
    draft: all.filter((r) => r.status === 'draft'),
    paid: all.filter((r) => r.status === 'paid'),
  };
  const age = AGES.find((a) => a.key === sp.age);
  let rows = byFilter[filter].filter((r) => matches(r, q));
  if (filter === 'overdue' && age) rows = rows.filter((r) => r.days_overdue >= age.min && r.days_overdue <= age.max);

  const href = (f: Filter) => {
    const p = new URLSearchParams();
    if (f !== 'all') p.set('filter', f);
    if (q) p.set('q', q);
    return `/invoices${p.size ? `?${p}` : ''}`;
  };
  const ageHref = (k?: string) => {
    const p = new URLSearchParams({ filter: 'overdue' });
    if (k) p.set('age', k);
    if (q) p.set('q', q);
    return `/invoices?${p}`;
  };

  const empty = q ? (
    <EmptyState icon={<SearchX />} title="No matches" message={`Nothing matches “${q}”. Try a number like ${profile.invoice_prefix}1087, a client or a word from the title.`} action={<Button href={href(filter).replace(/[?&]q=[^&]*/, '')} variant="tinted">Clear search</Button>} />
  ) : filter === 'overdue' ? (
    <EmptyState icon={<FileText />} title="Nothing overdue" message="Every sent invoice is within its terms. Nice." />
  ) : filter === 'draft' ? (
    <EmptyState icon={<FileText />} title="No drafts" message="Drafts you start but don’t send yet show up here." action={<Button href="/invoices/new" variant="filled">New invoice</Button>} />
  ) : filter === 'outstanding' ? (
    <EmptyState icon={<FileText />} title="All paid up" message="No invoices are waiting on payment." />
  ) : (
    <EmptyState icon={<FileText />} title="No invoices yet" message="Create your first invoice — it takes about a minute." action={<Button href="/invoices/new" variant="filled">New invoice</Button>} />
  );

  return (
    <Page
      title="Invoices"
      subtitle={open.length ? `${plural(open.length, 'open invoice')} · ${money(outstandingTotal)}` : 'All paid up'}
      wide
      actions={
        <>
          <Link href="/invoices/recurring" className="pressable hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-subhead font-medium text-accent-text hover:bg-fill-2 lg:inline-flex">
            <Repeat className="size-4" /> Recurring
          </Link>
          <NewInvoiceMenu lastByClient={lastByClient(all)} />
        </>
      }
      toolbar={
        <ListToolbar
          id="invoices"
          value={filter}
          searchPlaceholder="Number, client or title"
          options={[
            { value: 'all', label: 'All', href: href('all') },
            { value: 'outstanding', label: 'Outstanding', href: href('outstanding'), count: open.length },
            { value: 'overdue', label: 'Overdue', href: href('overdue'), count: overdue.length },
            { value: 'draft', label: 'Drafts', href: href('draft'), count: byFilter.draft.length || undefined },
            { value: 'paid', label: 'Paid', href: href('paid') },
          ]}
          trailing={
            <Link href="/invoices/recurring" aria-label="Recurring invoices" className="pressable inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-fill text-label-2 lg:hidden">
              <Repeat className="size-[18px]" />
            </Link>
          }
        />
      }
    >
      <SummaryStrip
        stats={[
          { label: 'Outstanding', value: outstandingTotal, sub: `${plural(open.length, 'invoice')} · in CAD`, href: href('outstanding') },
          { label: 'Overdue', value: overdueTotal, tone: 'red', sub: overdue.length ? `${plural(overdue.length, 'invoice')} past due` : 'Nothing overdue', href: href('overdue') },
          { label: `Paid · FY${fy}`, value: paidIn(cur), sub: `FY${fy - 1}: ${money(paidIn(prev), 'CAD', { cents: false })}` },
        ]}
      />
      {filter === 'overdue' && overdue.length > 0 && (
        <FilterChips
          items={[
            { label: 'Any age', href: ageHref(), active: !age, count: overdue.length },
            ...AGES.map((a) => ({ label: a.label, href: ageHref(a.key), active: age?.key === a.key, count: overdue.filter((r) => r.days_overdue >= a.min && r.days_overdue <= a.max).length })),
          ]}
        />
      )}
      <DocList rows={rows} empty={empty} />
    </Page>
  );
}
