import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Landmark, Lock, Scale, Repeat, Upload, PencilLine, Info } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, Card } from '@/components/ui/group';
import { BigMoney, Money } from '@/components/ui/money';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Attachments } from '@/components/files/attachments';
import { CategoryTile } from '@/components/expenses/category-icon';
import { ExpenseForm } from '@/components/expenses/expense-form';
import { ExpenseNavActions, SettleToggle } from '@/components/expenses/detail-actions';
import { expenseFormOptions } from '@/components/expenses/server';
import { treatment } from '@/components/expenses/math';
import { repayByDate } from '@/components/balances/loan';
import { db, must } from '@/lib/db';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { date, money, num, relativeDay, daysUntil, isoToday } from '@/lib/format';

export const metadata = { title: 'Expense' };

const CCA: Record<string, string> = {
  '50': 'Class 50 — computer hardware, 55% declining balance',
  '8': 'Class 8 — furniture & equipment, 20% declining balance',
  '12': 'Class 12 — software & small tools, 100%',
  '10': 'Class 10 — vehicles, 30% declining balance',
};
const SOURCE: Record<string, string> = { manual: 'Added by hand', bank_import: 'Created from a bank import', receipt_scan: 'Snapped from a receipt', recurring: 'Logged from a subscription' };

export default async function ExpenseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [me, profile, members, supabase] = await Promise.all([currentMember(), businessProfile(), allMembers(), db()]);

  const [ovRes, rawRes] = await Promise.all([
    supabase.from('expense_overview').select('*').eq('id', id).maybeSingle(),
    supabase.from('expenses').select('settlement_transfer_id, recurring_expense_id, bank_transaction_id').eq('id', id).maybeSingle(),
  ]);
  const e = must(ovRes);
  const raw = must(rawRes);
  if (!e || !raw) notFound();

  const lock = profile.lock_books_before;
  const locked = !!lock && e.spent_on! < lock;
  const editing = sp.edit === '1' && !locked;

  if (editing) {
    const options = await expenseFormOptions(me.id);
    return (
      <Page title="Edit expense" back={{ href: `/expenses/${id}`, label: e.vendor! }}>
        <ExpenseForm
          options={options}
          meId={me.id}
          today={isoToday()}
          lockBefore={lock}
          mode="edit"
          expenseId={id}
          initial={{
            spent_on: e.spent_on!, vendor: e.vendor!, description: e.description ?? '', category_id: e.category_id, project_id: e.project_id,
            spent_by: e.spent_by!, paid_from_account_id: e.paid_from_account_id!, nature: e.nature!, business_pct: num(e.business_pct),
            currency: e.currency === 'USD' ? 'USD' : 'CAD', total: num(e.total), gst_hst: num(e.gst_hst), pst: num(e.pst), fx_rate: num(e.fx_rate),
            billable: !!e.billable, tags: e.tags ?? [], notes: e.notes ?? '',
          }}
        />
      </Page>
    );
  }

  const [cat, files, bankRes, activity, transfer, subscription] = await Promise.all([
    e.category_id ? supabase.from('categories').select('deductible_pct, cca_class, gifi_code, name').eq('id', e.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('attachments').select('id, file_name, mime_type, size_bytes, original_size_bytes, compression').eq('entity_type', 'expense').eq('entity_id', id).order('created_at'),
    raw.bank_transaction_id
      ? supabase.from('bank_transactions').select('id, posted_on, description, amount, status, account_id, money_accounts(name, currency)').eq('id', raw.bank_transaction_id).maybeSingle()
      : supabase.from('bank_transactions').select('id, posted_on, description, amount, status, account_id, money_accounts(name, currency)').eq('matched_expense_id', id).limit(1).maybeSingle(),
    supabase.from('activity_log').select('id, member_id, action, created_at').eq('entity_id', id).order('created_at', { ascending: false }).limit(10),
    raw.settlement_transfer_id ? supabase.from('member_transfers').select('id, kind, amount, occurred_on').eq('id', raw.settlement_transfer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    raw.recurring_expense_id ? supabase.from('recurring_expenses').select('id, vendor, frequency').eq('id', raw.recurring_expense_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const category = cat.data;
  const bank = bankRes.data;
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const spender = memberById[e.spent_by!];
  const first = spender?.full_name.split(' ')[0] ?? 'Owner';

  const t = treatment({
    total: num(e.total), fxRate: num(e.fx_rate), gstHst: num(e.gst_hst), nature: e.nature!, businessPct: num(e.business_pct),
    categoryDeductiblePct: num(category?.deductible_pct ?? 100), paidWithBusinessFunds: !!e.paid_with_business_funds,
  });
  const repayBy = t.owed < 0 ? repayByDate(e.spent_on!, profile.fiscal_year_end) : null;
  const repayDays = repayBy ? daysUntil(repayBy) : null;

  return (
    <Page
      title={e.vendor!}
      back={{ href: '/expenses', label: 'Expenses' }}
      actions={<ExpenseNavActions id={id} vendor={e.vendor!} locked={locked} />}
    >
      <div className="lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-6">
        <div>
          {/* Hero */}
          <Card className="mb-7 flex flex-col items-center py-6 text-center lg:mb-6">
            <CategoryTile icon={e.category_icon} size={52} />
            <BigMoney value={e.total_cad} className="mt-3 text-[40px] leading-none lg:text-[34px]" />
            {e.currency !== 'CAD' && (
              <p className="tabular mt-1.5 text-subhead text-label-2">{money(e.total, e.currency!)} at {num(e.fx_rate).toFixed(4)} (Bank of Canada)</p>
            )}
            <p className="mt-2 text-subhead text-label-2">{e.description || e.category_name || 'No description'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <StatusBadge status={e.nature!} />
              {e.nature === 'mixed' && <Badge tone="blue">{num(e.business_pct)}% business</Badge>}
              {e.is_capital && <Badge tone="orange">Capital asset</Badge>}
              {e.attachment_count === 0 && e.nature !== 'personal' && <Badge tone="orange">No receipt</Badge>}
              {e.billable && <Badge tone="accent">Billable</Badge>}
            </div>
          </Card>

          {locked && (
            <p className="mb-6 flex items-center gap-2 rounded-group bg-fill px-3.5 py-3 text-footnote text-label-2">
              <Lock className="size-4 shrink-0" /> The books are closed before {date(lock)}. This expense is read-only.
            </p>
          )}

          <Section inset={16}>
            <Row title="Date" value={date(e.spent_on)} />
            <Row title="Category" value={e.category_name ?? 'None'} />
            <Row title="Who spent">
              <span className="flex items-center gap-2 text-label-2"><Avatar name={e.spent_by_name!} color={e.spent_by_color} initials={e.spent_by_initials} size={22} />{e.spent_by_name}</span>
            </Row>
            <Row title="Paid with" value={e.paid_from_name} />
            <Row title="What it was for" value={e.nature === 'mixed' ? `Mixed · ${num(e.business_pct)}% business` : e.nature === 'personal' ? 'Personal' : 'Business'} />
            {e.project_name && <Row title="Project" value={e.project_name} />}
            {(e.tags?.length ?? 0) > 0 && <Row title="Tags" value={e.tags!.map((x) => `#${x}`).join(' ')} />}
            {subscription.data && <Row title="Subscription" href="/subscriptions" value={`${subscription.data.vendor} · ${subscription.data.frequency}`} />}
          </Section>
          {e.notes && (
            <Section title="Notes"><p className="whitespace-pre-wrap px-4 py-3 text-body lg:px-3">{e.notes}</p></Section>
          )}

          <Section title="Receipts" footer={files.data?.length ? undefined : e.nature === 'personal' ? 'Optional for personal purchases.' : 'Add the receipt or invoice — CRA can ask for it for six years.'}>
            <Attachments entity="expense" entityId={id} items={must(files)} />
          </Section>
        </div>

        <div>
          <Section title="Tax treatment" inset={16}>
            <Row title="Total (CAD)" value={money(t.totalCad)} />
            {num(e.pst) > 0 && <Row title="PST (not recoverable)" value={money(num(e.pst) * num(e.fx_rate))} />}
            <Row title="Business use" value={`${t.businessPct}%`} />
            <Row title="Deductible share" value={`${t.deductiblePct}%`} detail={t.deductiblePct < 100 ? 'CRA 50% rule for meals & entertainment' : category?.gifi_code ? `GIFI ${category.gifi_code}` : undefined} />
            {e.is_capital ? (
              <Row title="Deductible now" value="$0.00" detail="Capital asset — claimed through CCA" />
            ) : (
              <Row title="Deductible amount" value={<span className="font-semibold text-label">{money(e.deductible_cad)}</span>} />
            )}
            <Row title="Input tax credit (ITC)" value={<span className="font-semibold text-label">{money(e.itc_cad)}</span>} detail={num(e.gst_hst) > 0 ? `${money(e.gst_hst, e.currency!)} GST/HST paid` : 'No GST/HST on this receipt'} />
          </Section>
          {e.is_capital && (
            <p className="-mt-5 mb-7 flex gap-2 px-4 text-footnote text-label-2 lg:px-1">
              <Info className="mt-0.5 size-4 shrink-0" />
              {CCA[category?.cca_class ?? ''] ?? `CCA class ${category?.cca_class ?? '—'}`}. Added to the CCA schedule on the T2 instead of being expensed; the half-year rule may apply in the year you buy it.
            </p>
          )}

          {t.owed !== 0 && (
            <Section title="Settlement">
              <div className="p-4 lg:p-3">
                <div className="flex items-start gap-3">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${t.owed > 0 ? 'bg-accent-soft text-accent-text' : 'bg-orange-soft text-orange'}`}><Scale className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold">{t.owed > 0 ? `Company owes ${first} ${money(t.owed)}` : `${first} owes the company ${money(-t.owed)}`}</p>
                    <p className="mt-0.5 text-footnote text-label-2">
                      {t.owed > 0 ? 'Paid with personal money for the business.' : 'Personal share paid with business money — part of the shareholder loan, never deductible.'}
                    </p>
                    {e.settled ? (
                      <p className="mt-1.5 text-footnote font-medium text-accent-text">
                        Settled {e.settled_on ? date(e.settled_on) : ''}{transfer.data ? ` · ${transfer.data.kind} of ${money(transfer.data.amount)} on ${date(transfer.data.occurred_on)}` : ''}
                      </p>
                    ) : repayBy ? (
                      <p className={`mt-1.5 text-footnote font-medium ${repayDays! <= profile.shareholder_loan_alert_days ? 'text-orange' : 'text-label-2'}`}>
                        Repay by {date(repayBy)} ({repayDays! < 0 ? `${-repayDays!} days overdue` : `${repayDays} days`}) to keep it out of {first}’s income — s.15(2)
                      </p>
                    ) : <p className="mt-1.5 text-footnote font-medium text-orange">Not reimbursed yet</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!e.settled && <Button href={`/balances?new=1&member=${e.spent_by}`} variant="filled" size="md">Settle up</Button>}
                  <SettleToggle id={id} settled={!!e.settled} />
                </div>
              </div>
            </Section>
          )}

          <Section title="Bank match" inset={58}>
            {bank ? (
              <Row
                href="/banking"
                icon={<span className="flex size-[30px] items-center justify-center rounded-[8px] bg-blue-soft text-blue"><Landmark className="size-4" /></span>}
                title={bank.description}
                subtitle={`${(bank.money_accounts as { name: string } | null)?.name ?? 'Account'} · ${date(bank.posted_on)}`}
                value={<Money value={bank.amount} currency={(bank.money_accounts as { currency: string } | null)?.currency ?? 'CAD'} />}
                detail={bank.status === 'matched' ? 'Matched' : bank.status}
              />
            ) : (
              <p className="px-4 py-3 text-subhead text-label-2 lg:px-3">
                {e.paid_from_kind === 'personal' ? 'Paid with personal money — no business bank line to match.' : 'No bank or card line linked yet. It’ll match when the statement is imported.'}
              </p>
            )}
          </Section>

          <Section title="Activity" inset={52}>
            <Row icon={<SourceIcon source={e.source!} />} title={SOURCE[e.source!] ?? e.source} value={relativeDay(e.created_at)} />
            {must(activity).filter((a) => a.action !== 'insert').map((a) => {
              const m = a.member_id ? memberById[a.member_id] : null;
              return (
                <Row
                  key={a.id}
                  icon={m ? <Avatar name={m.full_name} color={m.color} initials={m.initials} size={26} /> : <SourceIcon source="manual" />}
                  title={`${m?.full_name.split(' ')[0] ?? 'Someone'} ${a.action === 'update' ? 'edited' : a.action === 'delete' ? 'deleted' : a.action} it`}
                  value={relativeDay(a.created_at)}
                  detail={format(new Date(a.created_at), 'h:mm a')}
                />
              );
            })}
          </Section>

          <div className="flex flex-wrap gap-2 px-1 lg:hidden">
            <Button href={`/expenses/new?from=${id}`} variant="gray">Duplicate</Button>
            {!locked && <Link href={`/expenses/${id}?edit=1`} className="pressable inline-flex h-10 items-center rounded-md px-4 text-body font-medium text-accent-text">Edit</Link>}
          </div>
        </div>
      </div>
    </Page>
  );
}

function SourceIcon({ source }: { source: string }) {
  const I = source === 'bank_import' ? Upload : source === 'recurring' ? Repeat : PencilLine;
  return <span className="flex size-[26px] items-center justify-center rounded-full bg-fill text-label-2"><I className="size-3.5" /></span>;
}
