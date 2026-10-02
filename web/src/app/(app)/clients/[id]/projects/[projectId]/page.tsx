import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CalendarRange, Car, FileText, Paperclip, Receipt, TriangleAlert } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card, IconTile } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { BigMoney, Money } from '@/components/ui/money';
import { Button } from '@/components/ui/button';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { date, money, num, plural, round2, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DOC_COLS, expenseCost, preTax, type Doc } from '@/components/clients/data';
import { DocumentsSection, type DocRow } from '@/components/clients/documents-section';
import { BudgetBar, PROJECT_LABEL, PROJECT_TONE } from '@/components/clients/projects-section';
import { ProjectNavActions } from '@/components/clients/project-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string; projectId: string }> };

export async function generateMetadata({ params }: Params) {
  const { projectId } = await params;
  if (!UUID.test(projectId)) return { title: 'Project' };
  const supabase = await db();
  const { data } = await supabase.from('projects').select('name').eq('id', projectId).maybeSingle();
  return { title: data?.name ?? 'Project' };
}

export default async function ProjectPage({ params }: Params) {
  const { id, projectId } = await params;
  if (!UUID.test(id) || !UUID.test(projectId)) notFound();
  await currentMember();
  const supabase = await db();
  const [projectRes, clientRes, docsRes, expRes, tripsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).eq('client_id', id).maybeSingle(),
    supabase.from('clients').select('id, display_name, currency').eq('id', id).maybeSingle(),
    supabase.from('invoice_overview').select(DOC_COLS).eq('project_id', projectId).order('issue_date', { ascending: false }),
    supabase.from('expense_overview')
      .select('id, spent_on, vendor, description, total, currency, total_cad, itc_cad, effective_business_pct, billable, billed_invoice_id, category_name, attachment_count, spent_by_name')
      .eq('project_id', projectId).order('spent_on', { ascending: false }),
    supabase.from('mileage_trips').select('id, trip_on, purpose, origin, destination, km, rate_per_km').eq('project_id', projectId).order('trip_on', { ascending: false }),
  ]);
  const project = must(projectRes);
  const client = must(clientRes);
  if (!project || !client) notFound();
  const docs = must(docsRes) as Doc[];
  const expenses = must(expRes);
  const trips = must(tripsRes);
  const cur = client.currency;

  // ── Numbers ──
  const issuedDocs = docs.filter((d) => d.kind !== 'estimate' && d.status !== 'draft' && d.status !== 'void');
  const billed = round2(issuedDocs.reduce((s, d) => s + preTax(d), 0));
  const revenueCad = round2(issuedDocs.reduce((s, d) => s + preTax(d) * (num(d.fx_rate) || 1), 0));
  const draftTotal = round2(docs.filter((d) => d.kind === 'invoice' && d.status === 'draft').reduce((s, d) => s + preTax(d), 0));
  const expenseCad = round2(expenses.reduce((s, e) => s + expenseCost(e), 0));
  const mileageCad = round2(trips.reduce((s, t) => s + num(t.km) * num(t.rate_per_km), 0));
  const costCad = round2(expenseCad + mileageCad);
  const profit = round2(revenueCad - costCad);
  const margin = revenueCad > 0 ? Math.round((profit / revenueCad) * 100) : null;
  const unbilled = expenses.filter((e) => e.billable && !e.billed_invoice_id);
  const unbilledTotal = round2(unbilled.reduce((s, e) => s + num(e.total_cad), 0));
  const budget = project.budget === null ? null : num(project.budget);
  const pct = budget ? Math.round((billed / budget) * 100) : null;
  const collected = round2(issuedDocs.filter((d) => d.kind === 'invoice').reduce((s, d) => s + num(d.amount_paid), 0));
  const outstanding = round2(issuedDocs.filter((d) => d.kind === 'invoice' && (d.status === 'sent' || d.status === 'partial')).reduce((s, d) => s + num(d.balance), 0));

  const docRows: DocRow[] = docs.map((d) => ({
    id: d.id!, kind: d.kind!, number: d.number!, title: d.title, status: d.status!, issue_date: d.issue_date!, due_date: d.due_date,
    total: num(d.total), balance: num(d.balance), currency: d.currency ?? cur, is_overdue: !!d.is_overdue, days_overdue: num(d.days_overdue), project_name: null,
  }));
  const newInvoice = `/invoices/new?client=${client.id}&project=${project.id}`;

  return (
    <Page
      title={project.name}
      back={{ href: `/clients/${client.id}`, label: client.display_name }}
      actions={<ProjectNavActions project={project} clientId={client.id} currency={cur} />}
    >
      {/* ───────── Budget hero ───────── */}
      <Card className="mb-5 lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PROJECT_TONE[project.status]} dot>{PROJECT_LABEL[project.status] ?? project.status}</Badge>
          <Link href={`/clients/${client.id}`} className="text-subhead font-medium text-accent-text">{client.display_name}</Link>
          {(project.started_on || project.ended_on) && (
            <span className="flex items-center gap-1 text-subhead text-label-2">
              <CalendarRange className="size-3.5" />
              {project.started_on ? date(project.started_on) : 'No start'} – {project.ended_on ? date(project.ended_on) : project.status === 'done' ? 'Finished' : 'Ongoing'}
            </span>
          )}
        </div>

        <div className="mt-4">
          <div className="text-footnote font-medium text-label-2">Billed before tax</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <BigMoney value={billed} currency={cur} className="text-large" />
            {budget !== null && <span className="tabular text-subhead text-label-2">of {money(budget, cur)} budget</span>}
          </div>
          {budget ? (
            <>
              <BudgetBar billed={billed} budget={budget} thick className="mt-3" />
              <div className="mt-2 flex justify-between text-footnote">
                <span className={cn('tabular font-medium', billed > budget ? 'text-red' : 'text-label-2')}>
                  {pct}% billed{billed > budget ? ` · ${money(billed - budget, cur)} over budget` : ''}
                </span>
                <span className="tabular text-label-3">{billed <= budget ? `${money(budget - billed, cur)} left to bill` : ''}</span>
              </div>
              {draftTotal > 0 && <p className="mt-1 text-footnote text-label-3">Plus {money(draftTotal, cur)} in draft invoices.</p>}
            </>
          ) : (
            <p className="mt-1 text-footnote text-label-3">No budget set. Add one to track billed vs. budget.</p>
          )}
        </div>
      </Card>

      {/* ───────── Profitability ───────── */}
      <Section title="Profitability" footer={`Revenue is invoiced before tax, less credit notes${cur !== 'CAD' ? ', converted to CAD at each invoice’s rate' : ''}. Costs are the business share of tagged expenses less GST/HST you claim back${trips.length ? ', plus mileage' : ''}.`}>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Stat label="Revenue" value={<Money value={revenueCad} className="text-title3 font-semibold" />} sub={plural(issuedDocs.filter((d) => d.kind === 'invoice').length, 'invoice')} />
          <Stat label="Project costs" value={<Money value={costCad} className="text-title3 font-semibold" />} sub={[plural(expenses.length, 'expense'), trips.length ? plural(trips.length, 'trip') : null].filter(Boolean).join(' · ')} />
          <Stat label="Profit" value={<Money value={profit} className={cn('text-title3 font-semibold', profit < 0 ? 'text-red' : 'text-accent-text')} />} sub={margin === null ? 'No revenue yet' : `${margin}% margin`} />
          <Stat label="Collected" value={<Money value={collected} currency={cur} className="text-title3 font-semibold" />} sub={outstanding > 0 ? `${money(outstanding, cur)} outstanding` : 'Nothing outstanding'} subTone={outstanding > 0 ? 'orange' : undefined} />
        </div>
        {revenueCad > 0 && (
          <div className="px-4 pb-4 lg:px-3">
            <ProfitBar revenue={revenueCad} cost={costCad} />
          </div>
        )}
      </Section>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="min-w-0">
          <DocumentsSection docs={docRows} showProject={false} title="Invoices & estimates" newHref={{ invoice: newInvoice, estimate: `/invoices/new?kind=estimate&client=${client.id}&project=${project.id}` }} />
        </div>
        <div className="min-w-0">
          {/* ───────── Unbilled ───────── */}
          {unbilled.length > 0 && (
            <Section title="Unbilled expenses" inset={58}
              footer="Billable expenses on this project that haven’t been added to an invoice yet."
              action={<span className="tabular text-footnote font-semibold text-orange">{money(unbilledTotal)}</span>}>
              {unbilled.map((e) => (
                <Row key={e.id} href={`/expenses/${e.id}`}
                  icon={<IconTile color="#E8833A"><TriangleAlert strokeWidth={2.2} /></IconTile>}
                  title={<span className="font-medium">{e.vendor}</span>}
                  subtitle={[shortDate(e.spent_on), e.description].filter(Boolean).join(' · ')}
                  value={<span className="font-medium text-label">{money(e.total, e.currency ?? 'CAD')}</span>} />
              ))}
              <div className="p-3 lg:p-2.5">
                <Button variant="tinted" block href={`${newInvoice}&expenses=${unbilled.map((e) => e.id).join(',')}`} icon={<FileText className="size-4" />}>
                  Invoice {unbilled.length === 1 ? 'this expense' : `these ${unbilled.length} expenses`}
                </Button>
              </div>
            </Section>
          )}

          {/* ───────── All project expenses ───────── */}
          <Section title="Expenses" inset={58}
            action={expenses.length ? <span className="tabular text-footnote text-label-2">{money(round2(expenses.reduce((s, e) => s + num(e.total_cad), 0)))}</span> : undefined}>
            {expenses.length === 0 ? (
              <div className="px-6 py-7 text-center text-subhead text-label-2">
                No expenses tagged to this project. Choose the project when you add an expense to track its cost here.
              </div>
            ) : expenses.map((e) => (
              <Row key={e.id} href={`/expenses/${e.id}`}
                icon={<IconTile color="var(--fill-3)" fg="var(--label-2)"><Receipt strokeWidth={2.1} /></IconTile>}
                title={<span className="flex items-center gap-1.5"><span className="truncate font-medium">{e.vendor}</span>{(e.attachment_count ?? 0) > 0 && <Paperclip className="size-3.5 shrink-0 text-label-3" />}</span>}
                subtitle={[shortDate(e.spent_on), e.category_name, e.spent_by_name?.split(' ')[0]].filter(Boolean).join(' · ')}>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Money value={e.total} currency={e.currency} className="text-subhead font-medium" />
                  {e.billable && <Badge tone={e.billed_invoice_id ? 'accent' : 'orange'}>{e.billed_invoice_id ? 'Billed' : 'Billable'}</Badge>}
                </span>
              </Row>
            ))}
          </Section>

          {trips.length > 0 && (
            <Section title="Mileage" inset={58}>
              {trips.map((t) => (
                <Row key={t.id} icon={<IconTile color="#5E7CE2"><Car strokeWidth={2.1} /></IconTile>}
                  title={<span className="font-medium">{t.purpose}</span>}
                  subtitle={[shortDate(t.trip_on), [t.origin, t.destination].filter(Boolean).join(' → '), `${num(t.km)} km`].filter(Boolean).join(' · ')}
                  value={money(num(t.km) * num(t.rate_per_km))} />
              ))}
            </Section>
          )}

          {project.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-line px-4 py-3 text-body lg:px-3">{project.notes}</p>
            </Section>
          )}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value, sub, subTone }: { label: string; value: ReactNode; sub: string; subTone?: 'orange' }) {
  return (
    <div className="px-4 py-3 lg:px-3 [&:nth-child(n+3)]:hairline-t lg:[&:nth-child(n+3)]:shadow-none">
      <div className="text-footnote font-medium text-label-2">{label}</div>
      <div className="mt-0.5">{value}</div>
      <div className={cn('text-footnote', subTone === 'orange' ? 'text-orange' : 'text-label-3')}>{sub}</div>
    </div>
  );
}

/** Revenue split into cost and profit, one thin stacked bar. */
function ProfitBar({ revenue, cost }: { revenue: number; cost: number }) {
  const costPct = Math.min(100, (cost / revenue) * 100);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-fill" role="img" aria-label={`Costs are ${Math.round(costPct)}% of revenue`}>
        <span className="h-full bg-[var(--chart-out)]" style={{ width: `${costPct}%` }} />
        <span className="h-full flex-1 bg-[var(--chart-in)]" />
      </div>
      <div className="mt-1.5 flex gap-4 text-caption text-label-2">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-out)]" />Costs {Math.round(costPct)}%</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-in)]" />Profit {Math.max(0, 100 - Math.round(costPct))}%</span>
      </div>
    </div>
  );
}
