import Link from 'next/link';
import { Calculator, FileSpreadsheet, FolderLock, ChartColumn, Package, ChevronRight } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile, Card } from '@/components/ui/group';
import { BigMoney, Money } from '@/components/ui/money';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PeriodPicker } from '@/components/tax/period-picker';
import { Checklist } from '@/components/tax/checklist';
import { Deadlines } from '@/components/tax/deadlines';
import { periodFromParams } from '@/components/tax/books';
import { readiness, gstFor, t2For } from '@/components/tax/readiness';
import { gstReturn, type Worksheet } from '@/components/tax/gst';
import { incomeStatement, capitalSchedule, taxEstimate } from '@/components/tax/income';
import { periodLong } from '@/components/tax/period';
import { INSTALMENT_THRESHOLD } from '@/components/tax/rules';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { money } from '@/lib/format';

export const metadata = { title: 'Tax Centre' };

export default async function TaxCentre({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await currentMember();
  const sp = await searchParams;
  const { ctx, period } = await periodFromParams({ fy: sp.fy });
  const fy = period.fy!;
  const gstFiling = gstFor(ctx, period);
  const t2 = t2For(ctx, period);
  const supabase = await db();

  const [ready, gst, income, cca, docs] = await Promise.all([
    readiness(ctx, period),
    gstReturn(period, { worksheet: (gstFiling?.worksheet ?? {}) as Worksheet }),
    incomeStatement(period),
    capitalSchedule(fy, ctx, period),
    supabase.from('documents').select('id, title').in('id', ctx.filings.map((f) => f.document_id).filter(Boolean) as string[]),
  ]);
  const docTitle = new Map(must(docs).map((d) => [d.id, d.title]));
  const est = taxEstimate(income.netIncome, income.mealsAddBack, cca.totalCca);
  const gstNet = ctx.profile.gst_quick_method ? gst.quick.lines.l109 : gst.lines.l109;
  const items = ready.checks.map((c) => ({ ...c, reviewed: c.manual ? !!ready.reviews[c.manual] : undefined }));
  const pct = Math.round((ready.done / ready.total) * 100);

  return (
    <Page
      title="Tax Centre"
      subtitle={periodLong(period)}
      toolbar={<PeriodPicker path="/tax" years={ctx.years} fy={fy} />}
      actions={<Button size="sm" variant="tinted" href={`/tax/year-end?fy=${fy}`} icon={<Package className="size-4" />}>Year-end</Button>}
    >
      {/* Key numbers */}
      <div className="-mx-4 mb-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        <Stat href={`/reports/profit-loss?fy=${fy}`} label="Revenue">
          <BigMoney value={income.totalRevenue} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">Before GST/HST · credit notes netted</p>
        </Stat>
        <Stat href={`/reports/profit-loss?fy=${fy}`} label="Expenses">
          <BigMoney value={income.totalExpenses} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">Business share, net of ITCs</p>
        </Stat>
        <Stat href={`/tax/year-end?fy=${fy}`} label="Net income (estimate)">
          <BigMoney value={income.netIncome} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">Tax ≈ {money(est.tax, 'CAD', { cents: false })} at {Math.round(est.rate * 100)}% small-business rate</p>
        </Stat>
        <Stat href={`/tax/gst?fy=${fy}`} label={`GST/HST ${gstNet >= 0 ? 'to remit' : 'refund'}`}>
          <BigMoney value={Math.abs(gstNet)} className="text-title1" />
          <p className="mt-1 text-footnote text-label-2">
            {gstFiling?.filed_on ? 'Filed' : gstFiling?.due_on ? `Due ${new Date(gstFiling.due_on + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Line 109 net tax'}
            {gstNet >= INSTALMENT_THRESHOLD ? ' · instalments next year' : ''}
          </p>
        </Stat>
      </div>

      <div className="lg:grid lg:grid-cols-[1.45fr_1fr] lg:gap-6">
        <div>
          <Section
            title={`Year-end readiness · ${ready.done} of ${ready.total}`}
            action={<span className="tabular text-footnote font-medium text-label-2">{pct}%</span>}
            footer="Computed live from your books. Tap a row to fix it."
            inset={52}
          >
            <div className="h-1 bg-fill-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
              <div className="h-full rounded-r-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <Checklist items={items} period={{ start: period.start, end: period.end, due: t2?.due_on ?? null }} />
          </Section>

          <Section title="Shareholder balances at year-end" inset={58} footer="Positive = the company owes the shareholder. A shareholder who owes the company must repay within one year after year-end or it becomes income (s.15(2)).">
            {ready.balances.map((b) => (
              <Row
                key={b.member.id}
                href="/balances"
                icon={<Avatar name={b.member.full_name} color={b.member.color} initials={b.member.initials} size={30} />}
                title={b.member.full_name}
                subtitle={b.balance >= 0 ? 'Company owes them' : 'Owes the company'}
                value={<Money value={b.balance} className={b.balance < 0 ? 'font-semibold text-red' : 'font-semibold text-label'} />}
              />
            ))}
          </Section>
        </div>

        <div>
          <Deadlines
            filings={ctx.filings.map((f) => ({ ...f, document_title: f.document_id ? docTitle.get(f.document_id) ?? null : null }))}
            defaults={{ period_start: period.start, period_end: period.end }}
          />
          <Section title="Prepare" inset={58}>
            <Row href={`/tax/gst?fy=${fy}`} icon={<IconTile color="#E0352B"><Calculator /></IconTile>} title="GST/HST return" subtitle={`Worksheet with every GST34 line for FY${fy}`} />
            <Row href={`/tax/year-end?fy=${fy}`} icon={<IconTile color="#0680A2"><FileSpreadsheet /></IconTile>} title="T2 year-end package" subtitle="GIFI statement, CCA estimate, zip for your accountant" />
            <Row href={`/reports?fy=${fy}`} icon={<IconTile color="#7C4DDB"><ChartColumn /></IconTile>} title="Reports" subtitle="P&L, AR aging, cash flow" />
            <Row href={`/documents?fy=${fy}`} icon={<IconTile color="#5B6B70"><FolderLock /></IconTile>} title="Documents" subtitle={`${ready.statements.have} of ${ready.statements.expected} statements on file`} />
          </Section>
          <p className="px-4 text-footnote text-label-3 lg:px-1">
            Estimates to help prepare your returns — confirm with your accountant before filing.
          </p>
        </div>
      </div>
    </Page>
  );
}

function Stat({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="pressable group w-[78%] max-w-[300px] shrink-0 snap-start sm:w-[46%] lg:w-auto lg:max-w-none">
      <Card className="h-full">
        <div className="mb-2 flex items-center gap-1.5 text-footnote font-semibold text-label-2">
          <span>{label}</span>
          <ChevronRight className="ml-auto size-4 text-label-3 transition-transform group-hover:translate-x-0.5" />
        </div>
        {children}
      </Card>
    </Link>
  );
}
