import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, subMonths } from 'date-fns';
import { ClipboardList, Copy, FileText, HandCoins, Landmark, Globe2, Banknote, CreditCard, Mail, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card, IconTile } from '@/components/ui/group';
import { BigMoney, Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { date, money, num, plural, relativeDay } from '@/lib/format';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { cn } from '@/lib/cn';
import { activeTaxRates, loadClientDetail } from '@/components/clients/data';
import { addressLines, formatLocation } from '@/components/clients/format';
import { ClientTile } from '@/components/clients/client-tile';
import { ContactActions } from '@/components/clients/contact-actions';
import { ClientNavActions, ArchiveControl } from '@/components/clients/client-actions';
import { DocumentsSection, type DocRow } from '@/components/clients/documents-section';
import { ProjectsSection } from '@/components/clients/projects-section';
import { NotesCard } from '@/components/clients/notes-card';
import { StatementCard, type StatementPreset } from '@/components/clients/statement-card';
import { taxLabel, taxTreatment, termsLabel, countryName } from '@/components/clients/tax';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: 'Client' };
  const supabase = await db();
  const { data } = await supabase.from('clients').select('display_name').eq('id', id).maybeSingle();
  return { title: data?.display_name ?? 'Client' };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [, profile, rates] = await Promise.all([currentMember(), businessProfile(), activeTaxRates()]);
  const detail = await loadClientDetail(id, profile.fiscal_year_end);
  if (!detail) notFound();
  const { client: c, docs, payments, projects, stats: s, taxRate, others, fy } = detail;

  const cur = c.currency;
  const address = addressLines({ ...c, country: c.country !== 'CA' ? countryName(c.country) : c.country });
  const derived = taxTreatment(c.country, c.province);
  const taxOverridden = taxRate && taxRate.code !== derived.code;
  const openInvoices = docs.filter((d) => d.kind === 'invoice' && (d.status === 'sent' || d.status === 'partial'));
  const oldestOverdue = Math.max(0, ...openInvoices.filter((d) => d.is_overdue).map((d) => num(d.days_overdue)));
  const firstIssued = docs.filter((d) => d.kind === 'invoice' && d.status !== 'draft' && d.status !== 'void').map((d) => d.issue_date!).sort()[0];
  const terms = c.terms_days ?? profile.default_terms_days;

  const docRows: DocRow[] = docs.map((d) => ({
    id: d.id!, kind: d.kind!, number: d.number!, title: d.title, status: d.status!, issue_date: d.issue_date!, due_date: d.due_date,
    total: num(d.total), balance: num(d.balance), currency: d.currency ?? cur, is_overdue: !!d.is_overdue, days_overdue: num(d.days_overdue), project_name: d.project_name,
  }));

  // Statement periods
  const today = format(new Date(), 'yyyy-MM-dd');
  const fyNow = fiscalYearOf(new Date(), profile.fiscal_year_end);
  const presets: StatementPreset[] = [
    { key: 'fy', label: fy.label, from: fy.start, to: fy.end < today ? fy.end : today },
    ...(fy.fy !== fyNow ? [{ key: 'ytd', label: `FY${fyNow} to date`, from: fiscalRange(fyNow, profile.fiscal_year_end).start, to: today }] : []),
    { key: '12m', label: 'Last 12 months', from: format(subMonths(new Date(), 12), 'yyyy-MM-dd'), to: today },
    { key: 'all', label: 'All time', from: firstIssued ?? fy.start, to: today },
  ];
  const fileName = `Statement – ${c.display_name} – ${presets[0]!.to}`;

  const formRates = rates.filter((r) => r.kind !== 'pst').map((r) => ({ id: r.id, code: r.code, name: r.name, rate: Number(r.rate) }));
  const openSummary = { count: s.openCount, label: money(s.open, cur) };

  return (
    <Page
      title={c.display_name}
      back={{ href: '/clients', label: 'Clients' }}
      wide
      actions={<ClientNavActions client={c} taxRates={formRates} others={others} defaultTerms={profile.default_terms_days} open={openSummary} />}
    >
      {c.archived && <ArchiveControl client={c} open={openSummary} variant="banner" />}

      {/* ───────── Header card ───────── */}
      <Card className="mb-5 lg:p-5">
        <div className="flex items-start gap-4">
          <ClientTile name={c.display_name} size={58} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-headline font-semibold lg:text-title3">{c.company_name ?? c.display_name}</p>
            <p className="mt-0.5 truncate text-subhead text-label-2">{[c.contact_name, formatLocation({ ...c })].filter(Boolean).join(' · ') || 'No contact details yet'}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge tone={derived.code === 'ZERO' ? 'blue' : 'accent'}>
                {derived.code === 'ZERO' ? <Globe2 className="size-3" strokeWidth={2.4} /> : <Landmark className="size-3" strokeWidth={2.4} />}
                {taxLabel(taxRate?.code ?? derived.code)}{taxOverridden ? ' · set manually' : ''}
              </Badge>
              <Badge tone={cur === 'CAD' ? 'gray' : 'blue'}>{cur}</Badge>
              <Badge tone="gray">{termsLabel(c.terms_days, profile.default_terms_days)}</Badge>
              {s.openEstimates > 0 && <Badge tone="purple">{plural(s.openEstimates, 'open estimate')}</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-4 lg:max-w-[520px]">
          <ContactActions phone={c.phone} email={c.email} cc={c.cc_emails ?? []} address={address} subject={`${profile.operating_name ?? profile.legal_name}`} />
        </div>
      </Card>

      {/* ───────── KPIs ───────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Outstanding" className="col-span-2 lg:col-span-1"
          value={<BigMoney value={s.open} currency={cur} className={cn('text-title1 lg:text-title2', s.overdue > 0 && 'text-red')} />}
          sub={s.openCount ? plural(s.openCount, 'open invoice') : 'Nothing owing'} />
        <Kpi label="Overdue"
          value={<Money value={s.overdue} currency={cur} className={cn('text-title3 font-semibold', s.overdue > 0 ? 'text-red' : 'text-label-3')} />}
          sub={s.overdueCount ? `Oldest ${plural(oldestOverdue, 'day')} late` : 'All on time'} subTone={s.overdueCount ? 'red' : undefined} />
        <Kpi label="Lifetime billed"
          value={<Money value={s.billed} currency={cur} className="text-title3 font-semibold" />}
          sub={firstIssued ? `Since ${date(firstIssued, 'MMM yyyy')}` : 'No invoices yet'} />
        <Kpi label="Avg days to pay"
          value={<span className={cn('tabular text-title3 font-semibold', s.avgDaysToPay !== null && s.avgDaysToPay > terms && 'text-orange')}>{s.avgDaysToPay ?? '—'}{s.avgDaysToPay !== null && <span className="text-subhead font-medium text-label-3"> days</span>}</span>}
          sub={s.avgDaysToPay === null ? 'No paid invoices' : s.avgDaysToPay > terms ? `Slower than Net ${terms}` : `Within Net ${terms}`} subTone={s.avgDaysToPay !== null && s.avgDaysToPay > terms ? 'orange' : undefined} />
        <Kpi label="Last payment"
          value={s.lastPaymentAmount !== null ? <Money value={s.lastPaymentAmount} currency={cur} className="text-title3 font-semibold" /> : <span className="text-title3 font-semibold text-label-3">—</span>}
          sub={s.lastPaymentOn ? relativeDay(s.lastPaymentOn) : 'None yet'} />
      </div>

      {/* ───────── Quick actions ───────── */}
      <div className="mb-7 grid grid-cols-4 gap-2 lg:mb-6 lg:flex lg:gap-2">
        <Quick href={`/invoices/new?client=${c.id}`} icon={<FileText />} label="New invoice" primary />
        <Quick href={`/invoices/new?kind=estimate&client=${c.id}`} icon={<ClipboardList />} label="New estimate" />
        <Quick href={`/payments?new=1&client=${c.id}`} icon={<HandCoins />} label="Record payment" />
        <Quick href={s.lastInvoiceId ? `/invoices/new?from=${s.lastInvoiceId}` : undefined} icon={<Copy />} label="Duplicate last" title={s.lastInvoiceId ? 'Start a new invoice from the most recent one' : 'No invoices to duplicate yet'} />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <DocumentsSection docs={docRows} newHref={{ invoice: `/invoices/new?client=${c.id}`, estimate: `/invoices/new?kind=estimate&client=${c.id}` }} />

          <Section title="Payments" inset={58}
            action={payments.length > 6 ? <Link href={`/payments?client=${c.id}`} className="text-footnote font-medium text-accent-text">See all {payments.length}</Link> : undefined}>
            {payments.length === 0 ? (
              <div className="px-4 py-7 text-center text-subhead text-label-2">
                No payments yet. <Link href={`/payments?new=1&client=${c.id}`} className="font-semibold text-accent-text">Record one</Link>
              </div>
            ) : payments.slice(0, 6).map((p) => {
              const applied = (p.payment_allocations ?? []).map((a) => a.invoices?.number).filter(Boolean);
              const M = METHOD[p.method] ?? METHOD.other!;
              return (
                <Row key={p.id}
                  icon={<IconTile color={M.color}><M.icon strokeWidth={2.2} /></IconTile>}
                  title={<span className="font-medium">{M.label}</span>}
                  subtitle={[relativeDay(p.received_on), applied.length ? `Applied to ${applied.join(', ')}` : 'Unapplied', p.reference].filter(Boolean).join(' · ')}
                  value={<span className="font-medium text-label">{money(p.amount, p.currency)}</span>}
                />
              );
            })}
          </Section>
        </div>

        <div className="min-w-0">
          <StatementCard clientId={c.id} fileName={fileName} presets={presets} />
          <ProjectsSection clientId={c.id} currency={cur} projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status, budget: p.budget === null ? null : num(p.budget), billed: p.stats.billed, started_on: p.started_on }))} />
          <NotesCard clientId={c.id} initial={c.notes} />

          <Section title="Details">
            <Detail label="Email" value={c.email ? <a href={`mailto:${c.email}`} className="text-accent-text">{c.email}</a> : null} />
            {(c.cc_emails?.length ?? 0) > 0 && <Detail label="CC" value={c.cc_emails.join(', ')} />}
            <Detail label="Phone" value={c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="text-accent-text">{c.phone}</a> : null} />
            <Detail label="Address" value={address.length ? <span className="whitespace-pre-line">{address.join('\n')}</span> : null} />
            <Detail label="Sales tax" value={<>{taxRate?.name ?? derived.label}<span className="block text-footnote text-label-3">{taxOverridden ? `Overrides ${derived.label} (${derived.reason.toLowerCase()})` : derived.reason}</span></>} />
            <Detail label="Client since" value={date(c.created_at)} />
          </Section>

          <div className="mb-8 lg:mb-0">
            <ArchiveControl client={c} open={openSummary} variant="button" />
            <p className="mt-2 px-4 text-center text-footnote text-label-3 lg:px-1">
              {c.archived ? 'Bring them back into lists and invoice pickers.' : 'Hides the client from lists. Their invoices and history stay.'}
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}

const METHOD: Record<string, { label: string; icon: typeof Send; color: string }> = {
  etransfer: { label: 'Interac e-Transfer', icon: Send, color: '#E5A00D' },
  eft: { label: 'EFT deposit', icon: Landmark, color: '#0680A2' },
  wire: { label: 'Wire transfer', icon: Globe2, color: '#5E7CE2' },
  cheque: { label: 'Cheque', icon: Mail, color: '#6B7B80' },
  card: { label: 'Card', icon: CreditCard, color: '#7C4DDB' },
  stripe: { label: 'Stripe', icon: CreditCard, color: '#635BFF' },
  cash: { label: 'Cash', icon: Banknote, color: '#05A38C' },
  other: { label: 'Payment', icon: HandCoins, color: '#03BB90' },
};

function Kpi({ label, value, sub, subTone, className }: { label: string; value: ReactNode; sub: string; subTone?: 'red' | 'orange'; className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <span className="text-footnote font-medium text-label-2">{label}</span>
      <span className="mt-1">{value}</span>
      <span className={cn('mt-auto pt-0.5 text-footnote', subTone === 'red' ? 'font-medium text-red' : subTone === 'orange' ? 'font-medium text-orange' : 'text-label-3')}>{sub}</span>
    </Card>
  );
}

function Quick({ href, icon, label, primary, title }: { href?: string; icon: ReactNode; label: string; primary?: boolean; title?: string }) {
  const cls = cn(
    'pressable flex flex-col items-center gap-1.5 rounded-[14px] py-1 text-center lg:h-8 lg:flex-row lg:gap-1.5 lg:rounded-md lg:px-3 lg:py-0',
    primary ? 'lg:bg-accent lg:text-on-accent' : 'lg:bg-fill lg:text-label lg:hover:bg-fill-3',
    !href && 'pointer-events-none opacity-40',
  );
  const inner = (
    <>
      <span className={cn('flex size-12 items-center justify-center rounded-full lg:size-auto lg:bg-transparent lg:text-current [&_svg]:size-[22px] [&_svg]:stroke-[2] lg:[&_svg]:size-4',
        primary ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-text')}>{icon}</span>
      <span className="text-caption font-semibold leading-tight lg:text-subhead lg:font-medium">{label}</span>
    </>
  );
  if (!href) return <span className={cls} aria-disabled title={title}>{inner}</span>;
  return <Link href={href} className={cls} title={title}>{inner}</Link>;
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5 lg:px-3 lg:py-2">
      <span className="w-[92px] shrink-0 text-subhead text-label-2">{label}</span>
      <span className="min-w-0 flex-1 break-words text-subhead">{value ?? <span className="text-label-3">—</span>}</span>
    </div>
  );
}
