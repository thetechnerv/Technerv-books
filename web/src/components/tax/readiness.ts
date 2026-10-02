import 'server-only';
import { db, must } from '@/lib/db';
import { money, num, plural, date } from '@/lib/format';
import { statementCoverage } from '@/components/documents/statements';
import { memberBalancesAt, type TaxContext } from './books';
import type { Period } from './period';

export type CheckState = 'done' | 'todo' | 'warn' | 'info';
export type Check = { key: string; title: string; detail: string; state: CheckState; href: string; action?: string; manual?: 'owner_balances' | 'capital_assets' };

export type Reviews = Partial<Record<'owner_balances' | 'capital_assets', { on: string; by: string }>>;

/** The filing that holds year-end review ticks for a fiscal year (the T2 for that year). */
export function t2For(ctx: TaxContext, p: Period) {
  return ctx.filings.find((f) => f.kind === 't2' && f.period_end === p.end) ?? null;
}
export function gstFor(ctx: TaxContext, p: Period) {
  return ctx.filings.find((f) => f.kind === 'gst' && f.period_end === p.end && f.period_start <= p.start) ??
    ctx.filings.find((f) => f.kind === 'gst' && f.period_end === p.end) ?? null;
}

/** Year-end readiness, computed live from the books. */
export async function readiness(ctx: TaxContext, p: Period) {
  const supabase = await db();
  const fy = p.fy ?? '';
  const threshold = num(ctx.profile.receipt_required_over);
  const [unreviewed, noReceipt, drafts, trips, capital, balances, statements] = await Promise.all([
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed').gte('posted_on', p.start).lte('posted_on', p.end),
    supabase.from('expense_overview').select('id', { count: 'exact', head: true }).neq('nature', 'personal').eq('attachment_count', 0).gt('total_cad', threshold).gte('spent_on', p.start).lte('spent_on', p.end),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'draft').in('kind', ['invoice', 'credit_note']).gte('issue_date', p.start).lte('issue_date', p.end),
    supabase.from('mileage_trips').select('id', { count: 'exact', head: true }).gte('trip_on', p.start).lte('trip_on', p.end),
    supabase.from('expense_overview').select('id', { count: 'exact', head: true }).eq('is_capital', true).gte('spent_on', p.start).lte('spent_on', p.end),
    memberBalancesAt(p.end),
    statementCoverage(p),
  ]);
  const t2 = t2For(ctx, p);
  const gst = gstFor(ctx, p);
  const reviews = ((t2?.worksheet as { reviews?: Reviews } | null)?.reviews ?? {}) as Reviews;
  const owing = balances.filter((b) => b.balance < 0);
  const n = (r: { count: number | null }) => r.count ?? 0;
  const qs = `fy=${fy}`;

  const checks: Check[] = [
    {
      key: 'bank', title: 'Bank and card transactions reviewed', href: '/banking/review',
      state: n(unreviewed) ? 'todo' : 'done', action: n(unreviewed) ? 'Review' : undefined,
      detail: n(unreviewed) ? `${plural(n(unreviewed), 'transaction')} dated in FY${fy} still to review` : 'Every imported transaction is matched or ignored',
    },
    {
      key: 'receipts', title: 'Receipts attached', href: '/expenses?filter=no-receipt',
      state: n(noReceipt) ? 'todo' : 'done', action: n(noReceipt) ? 'Attach' : undefined,
      detail: n(noReceipt)
        ? `${plural(n(noReceipt), 'business expense')}${threshold ? ` over ${money(threshold)}` : ''} with no receipt`
        : 'Every business expense has a receipt on file',
    },
    {
      key: 'drafts', title: 'No draft invoices in the year', href: '/invoices?filter=draft',
      state: n(drafts) ? 'todo' : 'done', action: n(drafts) ? 'Open drafts' : undefined,
      detail: n(drafts) ? `${plural(n(drafts), 'draft')} dated in FY${fy} — send or delete them` : 'All invoices dated in the year have been issued',
    },
    {
      key: 'owners', title: 'Owner balances reviewed', href: '/balances', manual: 'owner_balances',
      state: reviews.owner_balances ? (owing.length ? 'warn' : 'done') : 'todo',
      detail: [
        balances.map((b) => `${b.member.full_name.split(' ')[0]} ${money(b.balance)}`).join(' · '),
        owing.length ? `${owing.map((b) => b.member.full_name.split(' ')[0]).join(' and ')} owe${owing.length === 1 ? 's' : ''} the company — repay within a year of year-end (s.15(2))` : '',
        reviews.owner_balances ? `Reviewed ${date(reviews.owner_balances.on)}` : 'at year-end',
      ].filter(Boolean).join(' · '),
    },
    {
      key: 'mileage', title: 'Mileage log', href: '/mileage',
      state: n(trips) ? 'done' : 'warn',
      detail: n(trips) ? `${plural(n(trips), 'trip')} logged in FY${fy}` : 'No trips logged — CRA expects a log to support any vehicle allowance',
    },
    {
      key: 'statements', title: 'Bank and card statements in Documents', href: `/documents?${qs}#statements`,
      state: statements.missing ? 'todo' : 'done', action: statements.missing ? 'Upload' : undefined,
      detail: `${statements.have} of ${statements.expected} monthly statements on file across ${plural(statements.rows.length, 'account')}`,
    },
    {
      key: 'capital', title: 'Capital assets reviewed', href: `/tax/year-end?${qs}#assets`, manual: 'capital_assets',
      state: reviews.capital_assets ? 'done' : 'todo',
      detail: `${plural(n(capital), 'capital purchase')} in FY${fy}${reviews.capital_assets ? ` · reviewed ${date(reviews.capital_assets.on)}` : ' · check nothing over $500 was expensed that should be capitalised'}`,
    },
    {
      key: 'gst', title: 'GST/HST return filed', href: `/tax/gst?${qs}`,
      state: gst?.filed_on ? 'done' : 'todo', action: gst?.filed_on ? undefined : 'Prepare',
      detail: gst?.filed_on ? `Filed ${date(gst.filed_on)}${gst.confirmation ? ` · ${gst.confirmation}` : ''}` : gst?.due_on ? `Due ${date(gst.due_on)}` : 'Not filed yet',
    },
  ];
  return { checks, done: checks.filter((c) => c.state === 'done').length, total: checks.length, balances, statements, t2, gst, reviews };
}

export async function filingDocuments(ids: string[]) {
  if (!ids.length) return [];
  const supabase = await db();
  return must(await supabase.from('documents').select('id, title, doc_type, fiscal_year').in('id', ids));
}
