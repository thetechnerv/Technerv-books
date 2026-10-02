import { ClipboardList, Plus, SearchX } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { DocList } from '@/components/invoices/doc-list';
import { ListToolbar } from '@/components/invoices/list-toolbar';
import { SummaryStrip } from '@/components/invoices/summary';
import { listDocs, matches } from '@/components/invoices/queries';
import { businessProfile } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { money, plural, round2 } from '@/lib/format';

export const metadata = { title: 'Estimates' };

const FILTERS = ['all', 'draft', 'sent', 'accepted', 'declined'] as const;
type Filter = (typeof FILTERS)[number];

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : 'all';
  const q = (sp.q ?? '').trim().slice(0, 80);
  const [profile, all] = await Promise.all([businessProfile(), listDocs(['estimate'])]);

  const fy = fiscalYearOf(new Date(), profile.fiscal_year_end);
  const range = fiscalRange(fy - 1, profile.fiscal_year_end);
  const cad = (r: (typeof all)[number]) => r.total * (r.fx_rate ?? 1);
  const by = (s: string) => all.filter((r) => r.status === s);
  const sent = by('sent');
  const decided = all.filter((r) => (r.status === 'accepted' || r.status === 'declined') && r.issue_date >= range.start && r.issue_date <= range.end);
  const won = decided.filter((r) => r.status === 'accepted');
  const rows = (filter === 'all' ? all : by(filter)).filter((r) => matches(r, q));

  const href = (f: Filter) => {
    const p = new URLSearchParams();
    if (f !== 'all') p.set('filter', f);
    if (q) p.set('q', q);
    return `/estimates${p.size ? `?${p}` : ''}`;
  };

  const empty = q ? (
    <EmptyState icon={<SearchX />} title="No matches" message={`No estimate matches “${q}”.`} action={<Button href={href(filter).replace(/[?&]q=[^&]*/, '')} variant="tinted">Clear search</Button>} />
  ) : filter === 'sent' ? (
    <EmptyState icon={<ClipboardList />} title="Nothing awaiting reply" message="Estimates you’ve sent and haven’t heard back on appear here." />
  ) : (
    <EmptyState
      icon={<ClipboardList />}
      title={filter === 'all' ? 'No estimates yet' : `No ${filter} estimates`}
      message="Send a quote first, then convert it to an invoice in one tap when it’s accepted."
      action={<Button href="/invoices/new?kind=estimate" variant="filled">New estimate</Button>}
    />
  );

  return (
    <Page
      title="Estimates"
      subtitle={sent.length ? `${plural(sent.length, 'estimate')} awaiting reply` : undefined}
      wide
      actions={
        <>
          <IconButton label="New estimate" href="/invoices/new?kind=estimate" className="lg:hidden"><Plus className="size-[22px]" strokeWidth={2.4} /></IconButton>
          <Button href="/invoices/new?kind=estimate" variant="filled" size="sm" icon={<Plus className="size-4" strokeWidth={2.6} />} className="hidden lg:inline-flex">New estimate</Button>
        </>
      }
      toolbar={
        <ListToolbar
          id="estimates"
          value={filter}
          searchPlaceholder="Number, client or title"
          options={[
            { value: 'all', label: 'All', href: href('all') },
            { value: 'draft', label: 'Draft', href: href('draft'), count: by('draft').length || undefined },
            { value: 'sent', label: 'Sent', href: href('sent'), count: sent.length || undefined },
            { value: 'accepted', label: 'Accepted', href: href('accepted') },
            { value: 'declined', label: 'Declined', href: href('declined') },
          ]}
        />
      }
    >
      <SummaryStrip
        stats={[
          { label: 'Awaiting reply', value: round2(sent.reduce((s, r) => s + cad(r), 0)), sub: plural(sent.length, 'estimate'), href: href('sent') },
          { label: `Accepted · FY${fy - 1}`, value: round2(won.reduce((s, r) => s + cad(r), 0)), sub: plural(won.length, 'estimate'), href: href('accepted') },
          {
            label: `Win rate · FY${fy - 1}`, value: 0,
            text: decided.length ? `${Math.round((won.length / decided.length) * 100)}%` : '—',
            sub: decided.length ? `${won.length} of ${decided.length} decided · ${money(round2(decided.reduce((s, r) => s + cad(r), 0)), 'CAD', { cents: false })} quoted` : 'No decisions yet',
          },
        ]}
      />
      <DocList rows={rows} empty={empty} />
    </Page>
  );
}
