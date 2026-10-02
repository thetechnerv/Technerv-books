import Link from 'next/link';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { AlertTriangle, ChevronRight, Package } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Money } from '@/components/ui/money';
import { PeriodPicker } from '@/components/tax/period-picker';
import { DownloadPackage } from '@/components/tax/download-package';
import { DrillSheet } from '@/components/tax/drill-sheet';
import { periodFromParams, memberBalancesAt, receivablesAt, accountBalancesAt, loadTransfers, referenceData } from '@/components/tax/books';
import { incomeStatement, capitalSchedule, taxEstimate, type GifiLine } from '@/components/tax/income';
import { gstReturn, type Worksheet } from '@/components/tax/gst';
import { gstFor, t2For } from '@/components/tax/readiness';
import { periodLong } from '@/components/tax/period';
import { MAX_TAX_YEAR_DAYS, GIFI_NAMES } from '@/components/tax/rules';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { date, money, plural } from '@/lib/format';

export const metadata = { title: 'Year-end package' };

export default async function YearEnd({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await currentMember();
  const sp = await searchParams;
  const { ctx, period } = await periodFromParams({ fy: sp.fy });
  const fy = period.fy!;
  const gstFiling = gstFor(ctx, period);
  const t2 = t2For(ctx, period);
  const supabase = await db();
  const [income, cca, balances, ar, cash, gst, transfers, ref, atts] = await Promise.all([
    incomeStatement(period),
    capitalSchedule(fy, ctx, period),
    memberBalancesAt(period.end),
    receivablesAt(period.end),
    accountBalancesAt(period.end),
    gstReturn(period, { worksheet: (gstFiling?.worksheet ?? {}) as Worksheet }),
    loadTransfers(period),
    referenceData(),
    supabase.from('attachments').select('entity_id').eq('entity_type', 'expense'),
  ]);
  const expIds = new Set(gst.expenses.map((e) => e.id));
  const receipts = (atts.data ?? []).filter((a) => expIds.has(a.entity_id)).length;

  const est = taxEstimate(income.netIncome, income.mealsAddBack, cca.totalCca);
  const days = differenceInCalendarDays(parseISO(period.end), parseISO(period.start)) + 1;
  const gstNet = ctx.profile.gst_quick_method ? gst.quick.lines.l109 : gst.lines.l109;
  const memberName = new Map(ref.members.map((m) => [m.id, m.full_name]));
  const byMember = ref.members.map((m) => {
    const t = transfers.filter((x) => x.member_id === m.id);
    const kinds = ['reimbursement', 'repayment', 'contribution', 'dividend', 'salary', 'other'].map((k) => ({ kind: k, total: t.filter((x) => x.kind === k).reduce((s, x) => s + Number(x.amount), 0), count: t.filter((x) => x.kind === k).length })).filter((k) => k.count);
    return { member: m, kinds, rows: t };
  });

  return (
    <Page
      title="Year-end package"
      subtitle={periodLong(period)}
      back={{ href: `/tax?fy=${fy}`, label: 'Tax Centre' }}
      toolbar={<PeriodPicker path="/tax/year-end" years={ctx.years} fy={fy} />}
    >
      <Card className="mb-7 lg:mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Package className="size-5 text-accent-text" />
              <span className="text-headline font-semibold">T2 prep package · FY{fy}</span>
              {t2?.filed_on ? <Badge tone="accent">T2 filed {date(t2.filed_on)}</Badge> : t2?.due_on ? <Badge tone="orange">T2 due {date(t2.due_on)}</Badge> : null}
            </div>
            <p className="mt-1 text-subhead text-label-2">
              One zip for your accountant: CSVs of invoices, payments, expenses (with deductible, ITC and receipt status), GIFI summary, capital assets, mileage, owner ledger,
              bank transactions and other income, every receipt file, and a one-page summary PDF.
            </p>
          </div>
          <DownloadPackage href={`/api/exports/year-end?fy=${fy}`} fileName={`TechNerv-FY${fy}-year-end.zip`} receipts={receipts} />
        </div>
        {days > MAX_TAX_YEAR_DAYS && (
          <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-orange-soft px-3 py-2 text-footnote text-label">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange" />
            This period is {days} days. A corporation&apos;s tax year can&apos;t be longer than 53 weeks (371 days) — confirm the first year&apos;s dates with your accountant.
          </p>
        )}
      </Card>

      <div className="lg:grid lg:grid-cols-[1.3fr_1fr] lg:gap-6">
        <div>
          <Section title="Income statement · GIFI (Schedule 125)" footer="Revenue is before GST/HST. Expenses are the business share, net of ITCs. Capital purchases are excluded (see CCA). Tap a line to see what's in it.">
            <GifiGroup lines={income.revenue} />
            <TotalRow code="8299" label={GIFI_NAMES['8299']!} value={income.totalRevenue} />
            <GifiGroup lines={income.expenses} />
            <TotalRow code="9368" label={GIFI_NAMES['9368']!} value={income.totalExpenses} />
            <TotalRow code="9970" label="Net income before taxes" value={income.netIncome} strong />
          </Section>

          <Section title="From net income to taxable income (estimate)" footer={`Small-business rate: 9% federal + 2% BC on active business income up to $500,000. CCA uses the first-year rules in force when bought. Estimate only — confirm with your accountant.`}>
            <Line label="Net income per the statement" value={income.netIncome} />
            <DrillSheet title="Meals and entertainment" summary="Only 50% of meals and entertainment is deductible (ITA s.67.1). The other half is added back." rows={income.mealsRows.map((e) => ({ id: e.id, href: `/expenses/${e.id}`, title: e.vendor, subtitle: date(e.spent_on), amount: e.bookCad - e.deductibleCad, detail: `Book ${money(e.bookCad)}` }))} total={income.mealsAddBack}>
              <Line label={`Add back 50% of meals and entertainment (${money(income.mealsBook)})`} value={income.mealsAddBack} sign="+" chevron />
            </DrillSheet>
            <Line label="Less capital cost allowance (estimate)" value={cca.totalCca} sign="−" href="#assets" />
            <Line label="Estimated taxable income" value={est.taxable} strong />
            <Line label={`Estimated Part I tax at ${Math.round(est.rate * 100)}%`} value={est.tax} strong />
          </Section>

          <Section title="Not in the expenses" footer="Personal portions are charged to the owner who spent them (shareholder account), not deducted.">
            <DrillSheet title="Personal portions" rows={income.personalRows.map((e) => ({ id: e.id, href: `/expenses/${e.id}`, title: e.vendor, subtitle: `${date(e.spent_on)} · ${e.nature === 'mixed' ? `${e.effective_business_pct}% business` : 'Personal'} · ${e.spent_by_name}`, amount: e.personalCad }))} total={income.personalExcluded}>
              <Line label={`Personal portions (${plural(income.personalRows.length, 'expense')})`} value={income.personalExcluded} chevron />
            </DrillSheet>
            <DrillSheet title="Capital purchases" rows={income.capitalRows.map((e) => ({ id: e.id, href: `/expenses/${e.id}`, title: e.vendor, subtitle: `${date(e.spent_on)} · ${e.category_name}`, amount: e.bookCad }))}>
              <Line label={`Capital purchases (${plural(income.capitalRows.length, 'item')}) — to CCA`} value={income.capitalRows.reduce((s, e) => s + e.bookCad, 0)} chevron />
            </DrillSheet>
          </Section>

          <div id="assets" className="scroll-mt-28" />
          <Section title="Capital assets & CCA (estimate)" footer={<>Capital cost = business share less the ITC claimed. First-year rules: classes 44/46/50 bought from Apr 16 2024 and in use before 2027 are written off 100%; other property bought after 2024 gets the accelerated investment incentive (1.5× the first-year rate). {cca.schedule.some((r) => r.proposed) && 'Property bought on/after Sep 15 2026 may qualify for a proposed 100% write-off that isn’t law yet. '}Assumes the maximum claim each year — your accountant decides the actual claim on Schedule 8.</>}>
            {cca.assets.length === 0 && <div className="px-4 py-6 text-center text-subhead text-label-2">No capital purchases yet.</div>}
            {cca.assets.filter((a) => a.fy <= fy).map((a) => (
              <Row key={a.id} href={`/expenses/${a.id}`} title={<span className="flex items-center gap-2">{a.vendor}{a.fy === fy && <Badge tone="accent">FY{fy}</Badge>}</span>}
                subtitle={`${date(a.spent_on)} · Class ${a.ccaClass} · ${a.description ?? a.category}${a.attachments ? '' : ' · no receipt'}`} value={money(a.cost)} />
            ))}
          </Section>
          {cca.schedule.length > 0 && (
            <div className="-mt-4 mb-7 overflow-x-auto rounded-group bg-cell shadow-card lg:mb-6">
              <table className="w-full min-w-[560px] text-left text-subhead lg:text-footnote">
                <thead className="text-footnote text-label-2 lg:text-caption">
                  <tr className="hairline-b">
                    <th className="px-4 py-2 font-medium lg:px-3">Class</th>
                    <th className="px-2 py-2 text-right font-medium">Opening UCC</th>
                    <th className="px-2 py-2 text-right font-medium">Additions</th>
                    <th className="px-2 py-2 font-medium">First-year rule</th>
                    <th className="px-2 py-2 text-right font-medium">CCA</th>
                    <th className="px-4 py-2 text-right font-medium lg:px-3">Closing UCC</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {cca.schedule.map((r) => (
                    <tr key={r.ccaClass} className="hairline-b last:shadow-none">
                      <td className="px-4 py-2.5 lg:px-3"><b>{r.ccaClass}</b> <span className="text-label-2">{Math.round(r.rate * 100)}%</span></td>
                      <td className="px-2 py-2.5 text-right">{money(r.opening)}</td>
                      <td className="px-2 py-2.5 text-right">{money(r.additions)}</td>
                      <td className="px-2 py-2.5 text-label-2">{r.rule}</td>
                      <td className="px-2 py-2.5 text-right font-semibold">{money(r.cca)}</td>
                      <td className="px-4 py-2.5 text-right lg:px-3">{money(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <Section title={`Shareholder loans at ${date(period.end)}`} inset={58} footer="Positive = the company owes the shareholder (a credit balance). Negative = the shareholder owes the company; repay within a year after year-end (s.15(2)).">
            {balances.map((b) => (
              <Row key={b.member.id} href="/balances" icon={<Avatar name={b.member.full_name} color={b.member.color} initials={b.member.initials} size={30} />}
                title={b.member.full_name} subtitle={`${plural(b.entries, 'entry', 'entries')} to year-end`} value={<Money value={b.balance} className={b.balance < 0 ? 'font-semibold text-red' : 'font-semibold text-label'} />} />
            ))}
          </Section>

          <Section title={`Accounts receivable at ${date(period.end)}`} footer="Invoices issued by year-end, less payments received by year-end.">
            {ar.buckets.map((b) => (
              <DrillSheet key={b.key} title={`Receivables · ${b.label}`} rows={b.items.map((i) => ({ id: i.id, href: `/invoices/${i.id}`, title: `${i.number} · ${i.client}`, subtitle: `Issued ${date(i.issue_date)}${i.due_date ? ` · due ${date(i.due_date)}` : ''}`, amount: i.balanceCad, detail: i.currency !== 'CAD' ? money(i.balance, i.currency) : undefined }))} total={b.total}>
                <Line label={`${b.label} · ${plural(b.items.length, 'invoice')}`} value={b.total} chevron={b.items.length > 0} />
              </DrillSheet>
            ))}
            <Line label="Total receivables" value={ar.total} strong />
          </Section>

          <Section title="GST/HST" footer={gstFiling?.filed_on ? `Filed ${date(gstFiling.filed_on)}${gstFiling.confirmation ? ` · ${gstFiling.confirmation}` : ''}.` : 'Not marked as filed yet.'}>
            <Line label="Sales and other revenue (101)" value={ctx.profile.gst_quick_method ? gst.quick.lines.l101 : gst.lines.l101} />
            <Line label="GST/HST collected (103)" value={ctx.profile.gst_quick_method ? gst.quick.lines.l103 : gst.lines.l103} />
            <Line label="ITCs (106)" value={ctx.profile.gst_quick_method ? gst.quick.lines.l106 : gst.lines.l106} />
            <Link href={`/tax/gst?fy=${fy}`} className="row-press block"><Line label="Net tax (109)" value={gstNet} strong chevron /></Link>
          </Section>

          <Section title={`Bank and card balances at ${date(period.end)}`} footer="From the imported feed's running balance on or before year-end. USD at the Bank of Canada rate on file.">
            {cash.map((c) => (
              <Row key={c.account.id} href="/banking" title={c.account.name} subtitle={c.asOf ? `Last transaction ${date(c.asOf)}` : 'No transactions'}
                value={money(c.balance, c.account.currency)} detail={c.account.currency !== 'CAD' ? `${money(c.balanceCad)} at ${c.rate}` : undefined} />
            ))}
          </Section>

          <Section title="Owner reimbursements and transfers" inset={58}>
            {byMember.map((m) => (
              <DrillSheet key={m.member.id} title={m.member.full_name} rows={m.rows.map((t) => ({ id: t.id, title: t.kind[0]!.toUpperCase() + t.kind.slice(1), subtitle: `${date(t.occurred_on)}${t.notes ? ` · ${t.notes}` : ''}`, amount: Number(t.amount) }))}>
                <span className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                  <Avatar name={m.member.full_name} color={m.member.color} initials={m.member.initials} size={30} />
                  <span className="min-w-0 flex-1 py-[11px] lg:py-2">
                    <span className="block">{memberName.get(m.member.id)}</span>
                    <span className="mt-0.5 block text-subhead text-label-2 lg:text-footnote">{m.kinds.length ? m.kinds.map((k) => `${k.kind} ${money(k.total, 'CAD', { cents: false })}`).join(' · ') : 'No transfers this year'}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
                </span>
              </DrillSheet>
            ))}
          </Section>
          <p className="px-4 text-footnote text-label-3 lg:px-1">Prepared from the books for your accountant. Not a filed return — confirm every figure before filing.</p>
        </div>
      </div>
    </Page>
  );
}

function GifiGroup({ lines }: { lines: GifiLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <details key={l.gifi} className="group">
          <summary className="row-press flex min-h-[var(--row-h)] cursor-default list-none items-center gap-3 px-4 lg:px-3 [&::-webkit-details-marker]:hidden">
            <span className="tabular w-11 shrink-0 text-footnote font-semibold text-label-2">{l.gifi}</span>
            <span className="min-w-0 flex-1 truncate py-2">{l.label}</span>
            <span className="tabular">{money(l.amount)}</span>
            <ChevronRight className="size-4 shrink-0 text-label-3 transition-transform group-open:rotate-90" strokeWidth={2.5} />
          </summary>
          <div className="pb-2 pl-[72px] pr-11 lg:pl-[68px]">
            {l.parts.map((p) => (
              <div key={p.name} className="flex items-center gap-2 py-1 text-subhead text-label-2 lg:text-footnote">
                <span className="flex-1 truncate">{p.name} <span className="text-label-3">· {p.count}</span></span>
                <span className="tabular">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}

function TotalRow({ code, label, value, strong }: { code: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex min-h-[var(--row-h)] items-center gap-3 bg-inset px-4 lg:px-3 ${strong ? 'font-semibold' : ''}`}>
      <span className="tabular w-11 shrink-0 text-footnote font-semibold text-label-2">{code}</span>
      <span className="flex-1 font-semibold">{label}</span>
      <span className={`tabular font-semibold ${strong ? 'text-headline' : ''}`}>{money(value)}</span>
      <span className="w-4" />
    </div>
  );
}

function Line({ label, value, strong, sign, chevron, href }: { label: string; value: number; strong?: boolean; sign?: string; chevron?: boolean; href?: string }) {
  const inner = (
    <span className={`flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3 ${strong ? 'bg-inset font-semibold' : chevron || href ? 'row-press' : ''}`}>
      <span className="min-w-0 flex-1 py-2">{label}</span>
      <span className="tabular">{sign && <span className="mr-1 text-label-3">{sign}</span>}{money(value)}</span>
      {(chevron || href) && <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />}
    </span>
  );
  return href ? <a href={href} className="block">{inner}</a> : inner;
}
