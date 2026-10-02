import Link from 'next/link';
import { Plus, Camera, Receipt, SearchX, ReceiptText, Scale, CreditCard, Landmark, Wallet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Page } from '@/components/ui/page';
import { LinkSegmented } from '@/components/ui/segmented';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Avatar } from '@/components/ui/avatar';
import { SearchBox, FilterPill } from '@/components/expenses/filters';
import { hrefWith } from '@/components/expenses/url';
import { ExpenseRows, ExpenseTable, groupByMonth, type ListExpense } from '@/components/expenses/expense-list';
import { CategoryTile } from '@/components/expenses/category-icon';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { money, num, round2, plural } from '@/lib/format';

export const metadata = { title: 'Expenses' };

type SP = { filter?: string; member?: string; account?: string; category?: string; fy?: string; month?: string; tag?: string; q?: string; sort?: string };
const FILTERS = ['all', 'no-receipt', 'to-settle', 'personal'] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [, profile, members, supabase] = await Promise.all([currentMember(), businessProfile(), allMembers(), db()]);
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? sp.filter! : 'all';
  const sort = sp.sort === 'amount' || sp.sort === 'vendor' ? sp.sort : 'date';
  const params: Record<string, string | undefined> = { ...sp };
  const yearEnd = profile.fiscal_year_end;

  let q = supabase.from('expense_overview').select(
    'id, spent_on, vendor, description, category_id, category_name, category_icon, spent_by, spent_by_name, spent_by_initials, spent_by_color, paid_from_account_id, paid_from_name, paid_from_kind, paid_with_business_funds, nature, business_pct, effective_business_pct, currency, total, total_cad, deductible_cad, itc_cad, attachment_count, settled, is_capital, tags',
  );
  if (sp.member) q = q.eq('spent_by', sp.member);
  if (sp.account) q = q.eq('paid_from_account_id', sp.account);
  if (sp.category) q = sp.category === 'none' ? q.is('category_id', null) : q.eq('category_id', sp.category);
  if (sp.tag) q = q.contains('tags', [sp.tag]);
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const start = `${sp.month}-01`;
    const end = format(new Date(Number(sp.month.slice(0, 4)), Number(sp.month.slice(5, 7)), 0), 'yyyy-MM-dd');
    q = q.gte('spent_on', start).lte('spent_on', end);
  } else if (sp.fy && /^\d{4}$/.test(sp.fy)) {
    const r = fiscalRange(Number(sp.fy), yearEnd);
    q = q.gte('spent_on', r.start).lte('spent_on', r.end);
  }
  if (sp.q?.trim()) {
    const term = sp.q.trim().replace(/[,%()*\\]/g, ' ').slice(0, 60);
    q = q.or(`vendor.ilike.%${term}%,description.ilike.%${term}%`);
  }
  q = q.order('spent_on', { ascending: false }).order('created_at', { ascending: false });

  const [rowsRes, cats, accounts, tagRows, range] = await Promise.all([
    q,
    supabase.from('categories').select('id, name, icon').eq('kind', 'expense').order('sort'),
    supabase.from('money_accounts').select('id, name, kind').eq('archived', false).order('kind'),
    supabase.from('expenses').select('tags').filter('tags', 'neq', '{}'),
    supabase.from('expenses').select('spent_on').order('spent_on').limit(1).maybeSingle(),
  ]);
  const all = must(rowsRes).map((r) => ({
    ...r, total: num(r.total), total_cad: num(r.total_cad), deductible_cad: num(r.deductible_cad), itc_cad: num(r.itc_cad),
    business_pct: num(r.effective_business_pct),
  })) as unknown as (ListExpense & { effective_business_pct: number; tags: string[] })[];

  const owes = (e: ListExpense) => e.paid_with_business_funds ? -round2(e.total_cad * (100 - e.business_pct) / 100) : round2(e.total_cad * e.business_pct / 100);
  const test = {
    all: () => true,
    'no-receipt': (e: ListExpense) => e.nature !== 'personal' && e.attachment_count === 0,
    'to-settle': (e: ListExpense) => !e.settled && owes(e) !== 0,
    personal: (e: ListExpense) => e.nature !== 'business',
  } as const;
  const counts = Object.fromEntries(FILTERS.map((f) => [f, all.filter(test[f]).length])) as Record<(typeof FILTERS)[number], number>;
  let rows = all.filter(test[filter as keyof typeof test]);
  if (sort === 'amount') rows = [...rows].sort((a, b) => b.total_cad - a.total_cad);
  if (sort === 'vendor') rows = [...rows].sort((a, b) => a.vendor.localeCompare(b.vendor));

  // Totals for what's on screen
  const total = round2(rows.reduce((s, e) => s + e.total_cad, 0));
  const deductible = round2(rows.filter((e) => !e.is_capital).reduce((s, e) => s + e.deductible_cad, 0));
  const capital = round2(rows.filter((e) => e.is_capital).reduce((s, e) => s + e.total_cad * e.business_pct / 100, 0));
  const itcs = round2(rows.reduce((s, e) => s + e.itc_cad, 0));
  const owedNet = round2(rows.filter((e) => !e.settled).reduce((s, e) => s + owes(e), 0));
  const groups = sort === 'date' ? groupByMonth(rows) : [{ key: 'all', label: sort === 'amount' ? 'Largest first' : 'A–Z', total, items: rows }];

  // Filter choices
  const base = '/expenses';
  const fyNow = fiscalYearOf(new Date(), yearEnd);
  const fyFirst = range.data ? fiscalYearOf(range.data.spent_on, yearEnd) : fyNow;
  const fys = Array.from({ length: fyNow - fyFirst + 1 }, (_, i) => fyNow - i);
  const monthFy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : sp.month ? fiscalYearOf(sp.month + '-15', yearEnd) : fyNow - (new Date().getMonth() === 9 ? 1 : 0);
  const fr = fiscalRange(monthFy, yearEnd);
  const months: string[] = [];
  for (let d = parseISO(fr.start); format(d, 'yyyy-MM-dd') <= fr.end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(format(d, 'yyyy-MM'));
  const tags = [...new Set(must(tagRows).flatMap((r) => r.tags))].sort();
  const periodValue = sp.month ? `m:${sp.month}` : sp.fy ? `fy:${sp.fy}` : undefined;
  const clear = (k: string | string[]) => hrefWith(base, params, Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, null])));
  const hasFilters = !!(sp.member || sp.account || sp.category || sp.fy || sp.month || sp.tag || sp.q);

  const toolbar = (
    <div className="space-y-2 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
      <LinkSegmented
        id="expense-filter"
        full
        className="lg:w-auto lg:min-w-[440px]"
        value={filter}
        options={[
          { value: 'all', label: 'All', href: hrefWith(base, params, { filter: null }) },
          { value: 'no-receipt', label: 'No receipt', count: counts['no-receipt'] || undefined, href: hrefWith(base, params, { filter: 'no-receipt' }) },
          { value: 'to-settle', label: 'To settle', count: counts['to-settle'] || undefined, href: hrefWith(base, params, { filter: 'to-settle' }) },
          { value: 'personal', label: 'Personal', href: hrefWith(base, params, { filter: 'personal' }) },
        ]}
      />
      <SearchBox base={base} params={params} placeholder="Search vendor or description" />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <FilterPill
          label="Who" title="Who spent" value={sp.member} clearHref={clear('member')}
          options={members.map((m) => ({ value: m.id, label: m.full_name.split(' ')[0]!, href: hrefWith(base, params, { member: m.id }), icon: <Avatar name={m.full_name} color={m.color} initials={m.initials} size={24} /> }))}
        />
        <FilterPill
          label="Paid with" value={sp.account} clearHref={clear('account')}
          options={must(accounts).map((a) => ({ value: a.id, label: a.name, href: hrefWith(base, params, { account: a.id }), icon: a.kind === 'credit_card' ? <CreditCard className="size-5 text-label-2" /> : a.kind === 'personal' ? <Wallet className="size-5 text-label-2" /> : <Landmark className="size-5 text-label-2" /> }))}
        />
        <FilterPill
          label="Category" value={sp.category} clearHref={clear('category')}
          options={[...must(cats).map((c) => ({ value: c.id, label: c.name, href: hrefWith(base, params, { category: c.id }), icon: <CategoryTile icon={c.icon} size={26} /> })),
            { value: 'none', label: 'Uncategorised', href: hrefWith(base, params, { category: 'none' }), icon: <CategoryTile icon={null} size={26} /> }]}
        />
        <FilterPill
          label="Period" value={periodValue} clearHref={clear(['fy', 'month'])}
          options={[
            ...fys.map((fy) => ({ value: `fy:${fy}`, label: `FY${fy}`, detail: `${format(parseISO(fiscalRange(fy, yearEnd).start), 'MMM yyyy')} – ${format(parseISO(fiscalRange(fy, yearEnd).end), 'MMM yyyy')}`, group: 'Fiscal year', href: hrefWith(base, params, { fy: String(fy), month: null }) })),
            ...months.slice().reverse().map((m) => ({ value: `m:${m}`, label: format(parseISO(m + '-01'), 'MMMM yyyy'), group: `Months in FY${monthFy}`, href: hrefWith(base, params, { month: m, fy: null }) })),
          ]}
        />
        {tags.length > 0 && (
          <FilterPill label="Tag" value={sp.tag} clearHref={clear('tag')} options={tags.map((t) => ({ value: t, label: `#${t}`, href: hrefWith(base, params, { tag: t }) }))} />
        )}
        {hasFilters && (
          <Link href={hrefWith(base, { filter: sp.filter }, {})} scroll={false} replace className="pressable inline-flex h-8 shrink-0 items-center rounded-full px-3 text-subhead font-medium text-accent-text lg:h-7 lg:text-footnote">Clear</Link>
        )}
      </div>
    </div>
  );

  return (
    <Page
      title="Expenses"
      subtitle={plural(rows.length, 'expense')}
      wide
      toolbar={toolbar}
      actions={
        <>
          <IconButton label="Snap receipt" href="/expenses/new?scan=1" className="lg:hidden"><Camera className="size-[22px]" /></IconButton>
          <IconButton label="New expense" href="/expenses/new" className="lg:hidden"><Plus className="size-6" strokeWidth={2.2} /></IconButton>
          <Button href="/expenses/new" variant="filled" size="md" icon={<Plus className="size-4" />} className="hidden lg:inline-flex">New expense</Button>
        </>
      }
    >
      {rows.length > 0 && (
        <div className="-mx-4 mb-6 flex gap-2.5 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
          <Stat label="Total" value={money(total)} detail={plural(rows.length, 'expense')} />
          <Stat label="Deductible" value={money(deductible)} detail={capital > 0 ? `+ ${money(capital)} capital (CCA)` : 'After 50% meals & personal share'} />
          <Stat label="ITCs (GST/HST back)" value={money(itcs)} detail="Claim on the GST return" />
          {filter === 'to-settle' || filter === 'personal' ? (
            <Stat label={owedNet >= 0 ? 'Company owes owners' : 'Owners owe company'} value={money(Math.abs(owedNet))} detail="Unsettled, net" tone={owedNet < 0 ? 'orange' : 'accent'} />
          ) : (
            <Stat label="Missing receipts" value={String(rows.filter(test['no-receipt']).length)} detail="Business or mixed" tone={rows.some(test['no-receipt']) ? 'orange' : undefined} />
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty filter={filter} searching={hasFilters} />
      ) : (
        <>
          <div className="lg:hidden"><ExpenseRows groups={groups} /></div>
          <div className="hidden lg:block">
            <ExpenseTable
              groups={groups}
              sort={sort}
              sortHrefs={{ date: hrefWith(base, params, { sort: null }), vendor: hrefWith(base, params, { sort: 'vendor' }), amount: hrefWith(base, params, { sort: 'amount' }) }}
            />
          </div>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'orange' | 'accent' }) {
  return (
    <div className="w-[44%] min-w-[150px] shrink-0 rounded-group bg-cell p-3.5 shadow-card lg:w-auto">
      <div className="text-footnote font-medium text-label-2">{label}</div>
      <div className={`tabular mt-0.5 text-title3 font-semibold ${tone === 'orange' ? 'text-orange' : tone === 'accent' ? 'text-accent-text' : ''}`}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-caption text-label-3">{detail}</div>}
    </div>
  );
}

function Empty({ filter, searching }: { filter: string; searching: boolean }) {
  if (searching) return <EmptyState icon={<SearchX />} title="No matching expenses" message="Try a different search or clear the filters." action={<Button href="/expenses" variant="tinted">Clear filters</Button>} />;
  if (filter === 'no-receipt') return <EmptyState icon={<ReceiptText />} title="Every receipt is in" message="Business and mixed expenses all have a receipt attached. Nice." />;
  if (filter === 'to-settle') return <EmptyState icon={<Scale />} title="Nothing to settle" message="No out-of-pocket spending or personal charges are waiting to be squared up." action={<Button href="/balances" variant="tinted">Owner balances</Button>} />;
  if (filter === 'personal') return <EmptyState icon={<Receipt />} title="No personal charges" message="Personal or mixed purchases show up here so they never get claimed by mistake." />;
  return <EmptyState icon={<Receipt />} title="No expenses yet" message="Snap a receipt or add an expense — who spent, how it was paid and what it was for." action={<Button href="/expenses/new" variant="filled" icon={<Plus className="size-4" />}>Add expense</Button>} />;
}
