import { AlertTriangle, CalendarClock, Info, ReceiptText, Globe2, UtensilsCrossed, FileWarning, ChevronRight, ShieldCheck } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Card, IconTile } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { LinkSegmented } from '@/components/ui/segmented';
import { PeriodPicker } from '@/components/tax/period-picker';
import { GstWorksheet } from '@/components/tax/gst-worksheet';
import { DrillSheet, type DrillRow } from '@/components/tax/drill-sheet';
import { FilingButton } from '@/components/tax/deadlines';
import { periodFromParams, periodFor } from '@/components/tax/books';
import { gstReturn, type Worksheet } from '@/components/tax/gst';
import { periodLong, addMonthsIso } from '@/components/tax/period';
import { gstDueDate, INSTALMENT_THRESHOLD, QUICK_METHOD, ITC_TIERS } from '@/components/tax/rules';
import { currentMember } from '@/lib/session';
import { date, money, plural } from '@/lib/format';
import type { Expense } from '@/components/tax/books';

export const metadata = { title: 'GST/HST return' };

type SP = { fy?: string; from?: string; to?: string; itc?: string };

export default async function GstPage({ searchParams }: { searchParams: Promise<SP> }) {
  await currentMember();
  const sp = await searchParams;
  const { ctx, period } = await periodFromParams(sp);
  const quickOn = ctx.profile.gst_quick_method;
  const filing = ctx.filings.find((f) => f.kind === 'gst' && f.period_start === period.start && f.period_end === period.end)
    ?? (period.fy ? ctx.filings.find((f) => f.kind === 'gst' && f.period_end === period.end) : undefined) ?? null;
  const ws = (filing?.worksheet ?? {}) as Worksheet;
  const excludeForeign = sp.itc === 'exclude';
  const g = await gstReturn(period, { worksheet: ws, excludeForeign });
  const L = quickOn ? g.quick.lines : g.lines;
  const keep = { from: sp.from, to: sp.to, fy: sp.fy, itc: sp.itc };
  const href = (over: Partial<SP>) => `/tax/gst?${new URLSearchParams(Object.entries({ ...keep, ...over }).filter(([, v]) => v) as [string, string][]).toString()}`;
  const due = filing?.due_on ?? gstDueDate(period.end);

  // Previous year's net tax decides whether instalments were due during this year.
  const prevFy = period.fy ? period.fy - 1 : null;
  const prev = prevFy && ctx.years.includes(prevFy) ? await gstReturn(periodFor(ctx, prevFy)) : null;
  const prevNet = prev ? (quickOn ? prev.quick.lines.l109 : prev.lines.l109) : null;

  const expRow = (e: Expense, amount = e.itc): DrillRow => ({
    id: e.id, href: `/expenses/${e.id}`, title: e.vendor, subtitle: `${date(e.spent_on)} · ${e.category_name ?? 'Uncategorised'}${e.currency !== 'CAD' ? ` · ${money(e.total, e.currency ?? 'USD')}` : ''}`,
    amount, detail: `Total ${money(e.total_cad)}`, badge: Number(e.attachment_count) ? undefined : { label: 'No receipt', tone: 'orange' },
  });
  const sum = (xs: { itc: number }[]) => Math.round(xs.reduce((s, x) => s + x.itc, 0) * 100) / 100;

  const flagCount = g.flags.noReceipt.length + g.flags.foreign.length + g.flags.salesFlags.length + g.flags.tiers.reduce((s, t) => s + (t.key === 'under100' ? 0 : t.missing.length), 0);

  return (
    <Page
      title="GST/HST return"
      subtitle={periodLong(period)}
      back={{ href: `/tax${period.fy ? `?fy=${period.fy}` : ''}`, label: 'Tax Centre' }}
      toolbar={<PeriodPicker path="/tax/gst" years={ctx.years} fy={period.fy} from={sp.from} to={sp.to} keep={{ itc: sp.itc }} custom />}
      actions={<FilingButton filing={filing} create={{ kind: 'gst', period_start: period.start, period_end: period.end, due_on: due }} />}
    >
      <div className="lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-6">
        <div>
          {/* Status */}
          <Card className="mb-7 lg:mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={quickOn ? 'purple' : 'blue'}>{quickOn ? 'Quick method' : 'Regular method'}</Badge>
              <Badge tone="gray">Annual filer</Badge>
              {filing?.filed_on ? <Badge tone="accent">Filed {date(filing.filed_on)}{filing.confirmation ? ` · ${filing.confirmation}` : ''}</Badge> : <Badge tone="orange">Due {date(due)}</Badge>}
            </div>
            <p className="mt-2.5 text-subhead text-label-2">
              Tax is reported when invoiced (accrual) and ITCs when the expense is incurred. Copy each line into the GST34 in CRA My Business Account. Lines with a field are yours to fill in.
            </p>
          </Card>

          <div className="mb-7 lg:mb-6">
            <h2 className="mb-1.5 px-4 text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:px-1 lg:text-caption">GST34 lines</h2>
            <GstWorksheet
              key={`${period.start}:${period.end}:${excludeForeign}`}
              base={quickOn ? { l101: g.quick.lines.l101, l103: g.quick.lines.l103, l106: g.quick.lines.l106, l107Base: g.quick.credit } : { l101: g.lines.l101, l103: g.lines.l103, l106: g.lines.l106 }}
              initial={ws}
              locked={!!filing?.filed_on}
              quick={quickOn}
              period={{ start: period.start, end: period.end, due }}
              hints={{
                '101': quickOn ? 'Eligible taxable supplies including GST/HST. Zero-rated exports are left out.' : `Includes ${money(g.totals.zeroRated, 'CAD', { cents: false })} zero-rated and ${money(g.totals.otherRevenue, 'CAD', { cents: false })} other income`,
                '104': 'e.g. bad debts recovered',
                '106': excludeForeign ? 'Excluding GST charged by foreign digital vendors' : g.totals.foreignItc ? `Includes ${money(g.totals.foreignItc)} charged by foreign vendors — see flags` : 'Meals already limited to 50%',
                '107': quickOn ? `Includes the 1% credit of ${money(g.quick.credit)}` : 'e.g. bad debts written off',
                '110': prevNet !== null && prevNet >= INSTALMENT_THRESHOLD ? `Instalments were likely due this year (FY${prevFy} net tax ${money(prevNet, 'CAD', { cents: false })})` : 'Quarterly instalments you paid for this year',
                '111': 'Only rebates the rebate form says to claim here',
              }}
            />
            <p className="mt-1.5 px-4 text-footnote text-label-2 lg:px-1">Line 101 is in whole dollars; every other line in dollars and cents. Estimates — confirm with your accountant before filing.</p>
          </div>

          {/* Instalments */}
          {period.fy && (
            <Card className="mb-7 flex gap-3 lg:mb-6">
              <IconTile color={L.l109 >= INSTALMENT_THRESHOLD ? '#E5A00D' : '#05A38C'}><CalendarClock /></IconTile>
              <div className="min-w-0 flex-1 text-subhead">
                {L.l109 >= INSTALMENT_THRESHOLD ? (
                  <>
                    <p className="font-semibold">Quarterly instalments likely for FY{period.fy + 1}</p>
                    <p className="mt-0.5 text-label-2">
                      Net tax is {money(L.l109)}, at or above the {money(INSTALMENT_THRESHOLD, 'CAD', { cents: false })} threshold. Annual filers pay about a quarter of it
                      — <b className="tabular text-label">{money(L.l109 / 4)}</b> — one month after each fiscal quarter:
                      {' '}{[3, 6, 9, 12].map((m) => date(endOfMonthAfter(period.end, m), 'MMM d, yyyy')).join(', ')}.
                      Not required if next year&apos;s net tax ends up under {money(INSTALMENT_THRESHOLD, 'CAD', { cents: false })}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">No instalments needed for FY{period.fy + 1}</p>
                    <p className="mt-0.5 text-label-2">Net tax is under {money(INSTALMENT_THRESHOLD, 'CAD', { cents: false })}, so the balance is simply due with the return.</p>
                  </>
                )}
              </div>
            </Card>
          )}

          {quickOn && (
            <Section title="Quick method calculation" footer={`Remittance rates for services from a BC permanent establishment. 1% credit on the first ${money(QUICK_METHOD.creditBase, 'CAD', { cents: false })} of eligible supplies. Only capital ITCs are claimed. Eligibility: taxable supplies up to ${money(QUICK_METHOD.eligibilityLimit, 'CAD', { cents: false })} a year.`}>
              {g.quick.base.map((b) => (
                <div key={b.key} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
                  <span className="min-w-0 flex-1"><span className="block">{b.label} <span className="text-label-2">{b.detail}</span></span><span className="block text-footnote text-label-2">{money(b.withTax)} incl. tax × {b.remit !== null ? `${(b.remit * 100).toFixed(1)}%` : 'no rate'}</span></span>
                  <span className="tabular">{b.amount !== null ? money(b.amount) : '—'}</span>
                </div>
              ))}
              <Line label="1% credit" value={-g.quick.credit} />
              <Line label="Capital ITCs" value={-g.quick.capitalItcs} />
              <Line label="Net tax (quick method)" value={g.quick.lines.l109} strong />
              <Line label={`Regular method would be ${money(g.lines.l109)}`} value={g.quick.saving} hint="Difference" />
            </Section>
          )}
        </div>

        <div>
          <Section title="Tax collected by rate" inset={16} footer={g.creditNotes.length ? `${plural(g.creditNotes.length, 'credit note')} netted (${money(g.totals.cnSales)} sales, ${money(g.totals.cnTax)} tax).` : 'No credit notes in this period.'}>
            {g.byRate.map((r) => (
              <DrillSheet
                key={r.key}
                title={`${r.label} · ${r.detail}`}
                summary={`${plural(r.docs.length, 'document')} · ${money(r.sales)} sales · ${money(r.tax)} tax`}
                rows={r.docs.map((d) => ({ id: d.id, href: `/invoices/${d.id}`, title: `${d.number} · ${d.client}`, subtitle: date(d.date), amount: d.tax, detail: `Sales ${money(d.net)}`, badge: d.kind === 'credit_note' ? { label: 'Credit note', tone: 'purple' } : undefined }))}
                total={r.tax}
              >
                <BreakdownRow title={r.label} subtitle={`${r.detail} · ${plural(r.docs.length, 'document')}`} value={r.zero ? money(r.sales) : money(r.tax)} detail={r.zero ? 'Sales · no tax' : `on ${money(r.sales, 'CAD', { cents: false })}`} />
              </DrillSheet>
            ))}
            {g.other.length > 0 && (
              <DrillSheet title="Other income" summary="Interest and other revenue outside invoices. Interest is an exempt financial service — no GST/HST." rows={g.other.map((o) => ({ id: o.id, title: o.source, subtitle: `${date(o.received_on)} · ${o.category}`, amount: o.amountCad, detail: o.gstCad ? `GST ${money(o.gstCad)}` : 'No tax' }))} total={g.totals.otherRevenue}>
                <BreakdownRow title="Other income" subtitle={`${plural(g.other.length, 'entry', 'entries')} · included in line 101`} value={money(g.totals.otherRevenue)} detail={g.totals.otherTax ? `Tax ${money(g.totals.otherTax)}` : 'No tax'} />
              </DrillSheet>
            )}
            <BreakdownRow title="Line 103 total" value={money(g.lines.l103)} strong />
          </Section>

          <Section title="Input tax credits by category" footer="ITC = GST/HST paid × business share. Meals and entertainment are limited to 50%. Personal purchases claim nothing.">
            {g.itcCategories.map((c) => (
              <DrillSheet key={c.name} title={c.name} summary={`${plural(c.count, 'expense')} with GST/HST · paid ${money(c.gstPaid)} · claimed ${money(c.itc)}`}
                rows={g.expenses.filter((e) => c.ids.includes(e.id)).map((e) => expRow(e, excludeForeign && e.currency !== 'CAD' ? 0 : e.itc))} total={c.itc}>
                <BreakdownRow title={c.name} subtitle={`${plural(c.count, 'expense')} · paid ${money(c.gstPaid)}`} value={money(c.itc)} />
              </DrillSheet>
            ))}
            <BreakdownRow title="Line 106 total" value={money(g.lines.l106)} strong />
          </Section>

          <Section title={`Check before filing${flagCount ? ` · ${flagCount}` : ''}`} inset={58}>
            <DrillSheet title="ITCs with no receipt" summary="CRA can deny an ITC you can't support. Attach the receipt or invoice, or leave the ITC for a later return (you have up to 4 years)." rows={g.flags.noReceipt.map((e) => expRow(e))} total={sum(g.flags.noReceipt)}>
              <FlagRow icon={<ReceiptText />} color="#E8833A" title="ITCs claimed with no receipt" subtitle={g.flags.noReceipt.length ? `${plural(g.flags.noReceipt.length, 'expense')} · ${money(sum(g.flags.noReceipt))} of ITCs` : 'Every ITC has a receipt'} ok={!g.flags.noReceipt.length} />
            </DrillSheet>
            {g.flags.tiers.filter((t) => t.key !== 'under100').map((t) => (
              <DrillSheet key={t.key} title={`ITC documents · ${t.label}`} summary={t.need} rows={g.expenses.filter((e) => e.itc > 0 && t.key === tierOf(e)).map((e) => expRow(e))} total={t.itc}
                footer="Open each receipt and confirm it shows the details above.">
                <FlagRow icon={<FileWarning />} color={t.missing.length ? '#E0352B' : '#6B7B80'} title={`Receipts ${t.label}`} subtitle={`${plural(t.count, 'expense')} · ${t.missing.length ? `${t.missing.length} without a receipt` : 'check they show the supplier’s GST/HST number'}`} ok={!t.missing.length && !t.count} />
              </DrillSheet>
            ))}
            <DrillSheet title="GST/HST charged by foreign vendors" summary="Foreign digital-service vendors registered under CRA's simplified framework can't give you ITCs. Give them your GST/HST number so they stop charging it and ask for a refund of tax already charged. If a vendor is registered under the normal regime (its number ends in RT0001), the ITC is fine." rows={g.flags.foreign.map((e) => expRow(e))} total={g.totals.foreignItc}>
              <FlagRow icon={<Globe2 />} color="#0680A2" title="USD purchases with GST charged" subtitle={g.flags.foreign.length ? `${plural(g.flags.foreign.length, 'expense')} · ${money(g.totals.foreignItc)} of ITCs${excludeForeign ? ' (excluded)' : ''}` : 'None'} ok={!g.flags.foreign.length} />
            </DrillSheet>
            <DrillSheet title="Meals and entertainment" summary="ITCs are limited to 50% of the GST/HST paid (ETA s.236), the same as the income-tax deduction. Already applied." rows={g.flags.meals.map((e) => expRow(e))} total={sum(g.flags.meals)}>
              <FlagRow icon={<UtensilsCrossed />} color="#05A38C" title="Meals ITCs at 50%" subtitle={`${plural(g.flags.meals.length, 'expense')} · ${money(g.flags.meals.reduce((s, e) => s + e.gstPaidCad, 0))} paid, ${money(sum(g.flags.meals))} claimed`} ok />
            </DrillSheet>
            {g.flags.salesFlags.length > 0 && (
              <DrillSheet title="Sales tax codes to check" rows={g.flags.salesFlags.map((f, i) => ({ id: f.doc.id + i, href: `/invoices/${f.doc.id}`, title: `${f.doc.number} · ${f.doc.client.name}`, subtitle: f.issue, amount: f.doc.taxCad }))}>
                <FlagRow icon={<AlertTriangle />} color="#E0352B" title="Invoices with an unusual tax code" subtitle={plural(g.flags.salesFlags.length, 'invoice')} />
              </DrillSheet>
            )}
            {g.flags.foreign.length > 0 && (
              <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2 lg:px-3">
                <Info className="size-5 shrink-0 text-label-3" />
                <span className="flex-1 text-footnote text-label-2">{excludeForeign ? 'Line 106 excludes foreign-vendor GST.' : 'Line 106 includes foreign-vendor GST.'}</span>
                <LinkSegmented id="itc" options={[{ value: 'include', label: 'Include', href: href({ itc: undefined }) }, { value: 'exclude', label: 'Exclude', href: href({ itc: 'exclude' }) }]} value={excludeForeign ? 'exclude' : 'include'} />
              </div>
            )}
          </Section>
          <p className="flex items-start gap-1.5 px-4 text-footnote text-label-3 lg:px-1">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Keep receipts and records for six years after the end of the year they relate to.
          </p>
        </div>
      </div>
    </Page>
  );
}

function tierOf(e: Expense) {
  const t = Number(e.total_cad);
  return t < 100 ? ITC_TIERS[0].key : t < 500 ? ITC_TIERS[1].key : ITC_TIERS[2].key;
}

function endOfMonthAfter(end: string, months: number) {
  // One month after each fiscal quarter of the next year: year-end + 3/6/9/12 months, then +1 month.
  const d = addMonthsIso(end.slice(0, 8) + '01', months + 1);
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

function BreakdownRow({ title, subtitle, value, detail, strong }: { title: string; subtitle?: string; value: string; detail?: string; strong?: boolean }) {
  return (
    <span className={`flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3 ${strong ? 'bg-inset' : 'row-press'}`}>
      <span className="min-w-0 flex-1 py-[11px] lg:py-2">
        <span className={`block truncate ${strong ? 'font-semibold' : ''}`}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-subhead text-label-2 lg:text-footnote">{subtitle}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={`tabular ${strong ? 'font-semibold' : ''}`}>{value}</span>
        {detail && <span className="tabular text-footnote text-label-3">{detail}</span>}
      </span>
      {!strong && <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />}
    </span>
  );
}

function FlagRow({ icon, color, title, subtitle, ok }: { icon: React.ReactNode; color: string; title: string; subtitle: string; ok?: boolean }) {
  return (
    <span className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
      <IconTile color={ok ? 'var(--fill-3)' : color} fg={ok ? 'var(--label-2)' : '#fff'}>{icon}</IconTile>
      <span className="min-w-0 flex-1 py-[11px] lg:py-2">
        <span className="block truncate">{title}</span>
        <span className="mt-0.5 block text-subhead text-label-2 lg:text-footnote">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />
    </span>
  );
}

function Line({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3 ${strong ? 'bg-inset font-semibold' : ''}`}>
      <span className="flex-1">{label}{hint && <span className="ml-1 text-label-3">· {hint}</span>}</span>
      <span className="tabular">{money(value)}</span>
    </div>
  );
}
