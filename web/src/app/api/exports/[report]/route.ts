import { NextResponse, type NextRequest } from 'next/server';
import { currentMember } from '@/lib/session';
import { isoToday } from '@/lib/format';
import { toCsv, csvResponse, type Cell } from '@/components/reports/csv';
import { periodFromParams } from '@/components/tax/books';
import { isIsoDate } from '@/components/tax/period';
import { profitAndLoss, expensesByCategory, spending, revenueByClient, arAging, cashFlow } from '@/components/reports/data';

/**
 * GET /api/exports/<report>?fy=2026 | ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Reports: profit-loss, expenses, spending, revenue, ar-aging (?asof=), cash-flow.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  await currentMember();
  const { report } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as { fy?: string; from?: string; to?: string; asof?: string };
  const { period } = await periodFromParams(sp);
  const tag = period.fy && !period.custom ? `FY${period.fy}` : `${period.start}_${period.end}`;

  switch (report) {
    case 'profit-loss': {
      const pl = await profitAndLoss(period);
      const head = ['section', 'category', 'gifi', 'detail', ...pl.months.map((m) => m.key), 'total'];
      const rows: Cell[][] = [];
      for (const [section, list] of [['Revenue', pl.revenue], ['Expenses', pl.expense]] as const) {
        for (const r of list) {
          rows.push([section, r.name, r.gifi, '', ...r.months, r.total]);
          for (const p of r.parts ?? []) rows.push([section, r.name, r.gifi, p.name, ...p.months, p.total]);
        }
      }
      rows.push(['Total', 'Revenue', '8299', '', ...pl.revenueMonths, pl.totalRevenue]);
      rows.push(['Total', 'Expenses', '9368', '', ...pl.expenseMonths, pl.totalExpenses]);
      rows.push(['Total', 'Net income', '9970', '', ...pl.netMonths, pl.net]);
      return csvResponse(`profit-loss-${tag}.csv`, toCsv(head, rows));
    }
    case 'expenses': {
      const r = await expensesByCategory(period);
      const rows: Cell[][] = r.rows.flatMap((c) => [[c.name, c.gifi, '', c.amount], ...c.vendors.map((v) => [c.name, c.gifi, v.name, v.total])]);
      rows.push(['Total', '', '', r.total], ['Capital purchases (not expensed)', '', '', r.capital]);
      return csvResponse(`expenses-by-category-${tag}.csv`, toCsv(['category', 'gifi', 'vendor', 'amount_cad'], rows));
    }
    case 'spending': {
      const r = await spending(period);
      const rows: Cell[][] = [
        ...r.owners.map((o) => ['owner', o.name, o.count, o.business, o.personal, o.total, o.outOfPocket]),
        ...r.accounts.map((a) => ['account', a.name, a.count, a.business, Math.round((a.total - a.business) * 100) / 100, a.total, '']),
      ];
      return csvResponse(`spending-${tag}.csv`, toCsv(['group', 'name', 'expenses', 'business_cad', 'personal_cad', 'total_cad', 'out_of_pocket_cad'], rows));
    }
    case 'revenue': {
      const r = await revenueByClient(period);
      return csvResponse(`revenue-by-client-${tag}.csv`, toCsv(['client', 'documents', 'net_sales_cad', 'tax_cad', 'open_today_cad', 'currencies'], r.rows.map((c) => [c.name, c.count, c.net, c.tax, c.open, c.currency.join(' ')])));
    }
    case 'ar-aging': {
      const asOf = isIsoDate(sp.asof) ? sp.asof : isoToday();
      const ar = await arAging(asOf);
      return csvResponse(`ar-aging-${asOf}.csv`, toCsv(
        ['invoice', 'client', 'issue_date', 'due_date', 'days_past_due', 'bucket', 'currency', 'balance', 'balance_cad'],
        ar.open.map((i) => [i.number, i.client, i.issue_date, i.due_date, i.daysOverdue, i.bucket, i.currency, i.balance, i.balanceCad]),
      ));
    }
    case 'cash-flow': {
      const cf = await cashFlow(period);
      const rows: Cell[][] = cf.rows.map((m) => [m.key, m.in, m.out, m.net, m.count]);
      rows.push(['Total', cf.totalIn, cf.totalOut, cf.net, '']);
      return csvResponse(`cash-flow-${tag}.csv`, toCsv(['month', 'money_in_cad', 'money_out_cad', 'net_cad', 'transactions'], rows));
    }
    default:
      return new NextResponse('Unknown report', { status: 404 });
  }
}
