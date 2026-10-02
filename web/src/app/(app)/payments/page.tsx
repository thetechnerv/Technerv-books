import { HandCoins, SearchX } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { ListToolbar } from '@/components/invoices/list-toolbar';
import { SummaryStrip } from '@/components/invoices/summary';
import { PaymentsActions, PaymentsList, type PaymentRow } from '@/components/invoices/payments-view';
import { paymentFormData } from '@/components/invoices/payment-data';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { fiscalRange, fiscalYearOf } from '@/lib/fiscal';
import { isoToday, money, num, plural, round2 } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';

export const metadata = { title: 'Payments' };

const METHOD_FILTERS: { value: string; label: string; methods: PaymentMethod[] }[] = [
  { value: 'all', label: 'All', methods: [] },
  { value: 'etransfer', label: 'e-Transfer', methods: ['etransfer'] },
  { value: 'eft', label: 'EFT', methods: ['eft'] },
  { value: 'wire', label: 'Wire', methods: ['wire'] },
  { value: 'cheque', label: 'Cheque', methods: ['cheque'] },
  { value: 'other', label: 'Other', methods: ['card', 'cash', 'stripe', 'other'] },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ method?: string; client?: string; q?: string; id?: string; new?: string; invoice?: string }> }) {
  const sp = await searchParams;
  const supabase = await db();
  const [profile, payRes, clientRes] = await Promise.all([
    businessProfile(),
    supabase.from('payments')
      .select('id, client_id, received_on, amount, currency, fx_rate, method, deposit_account_id, reference, notes, created_at, clients(display_name), money_accounts(name), payment_allocations(invoice_id, amount, invoices(number))')
      .order('received_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('clients').select('id, display_name').order('display_name'),
  ]);
  const all: PaymentRow[] = must(payRes).map((p) => ({
    id: p.id, client_id: p.client_id, client_name: p.clients?.display_name ?? 'No client', received_on: p.received_on, amount: num(p.amount),
    currency: p.currency, fx_rate: num(p.fx_rate) || 1, method: p.method, deposit_account_id: p.deposit_account_id, account_name: p.money_accounts?.name ?? null,
    reference: p.reference, notes: p.notes,
    allocations: p.payment_allocations.map((a) => ({ invoice_id: a.invoice_id, number: a.invoices?.number ?? '—', amount: num(a.amount) })),
  }));
  const data = await paymentFormData({ paymentIds: all.map((p) => p.id) });

  const method = METHOD_FILTERS.find((m) => m.value === sp.method) ?? METHOD_FILTERS[0]!;
  const clientId = sp.client && all.some((p) => p.client_id === sp.client) ? sp.client : sp.client && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : null;
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 80);
  const rows = all.filter((p) =>
    (!method.methods.length || method.methods.includes(p.method)) &&
    (!clientId || p.client_id === clientId) &&
    (!q || (p.reference ?? '').toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.allocations.some((a) => a.number.toLowerCase().includes(q)) || String(p.amount).includes(q)));
  // A deep-linked payment always shows, even if filters would hide it.
  if (sp.id && !rows.some((r) => r.id === sp.id)) { const hit = all.find((p) => p.id === sp.id); if (hit) rows.unshift(hit); }

  const fy = fiscalYearOf(new Date(), profile.fiscal_year_end);
  const cur = fiscalRange(fy, profile.fiscal_year_end);
  const prev = fiscalRange(fy - 1, profile.fiscal_year_end);
  const scope = clientId ? all.filter((p) => p.client_id === clientId) : all;
  const sum = (list: PaymentRow[]) => round2(list.reduce((s, p) => s + p.amount * p.fx_rate, 0));
  const inRange = (r: { start: string; end: string }) => scope.filter((p) => p.received_on >= r.start && p.received_on <= r.end);
  const month = isoToday().slice(0, 7);
  const thisMonth = scope.filter((p) => p.received_on.startsWith(month));
  const unapplied = round2(scope.reduce((s, p) => s + Math.max(0, p.amount - p.allocations.reduce((t, a) => t + a.amount, 0)) * p.fx_rate, 0));
  const clientName = clientId ? clientRes.data?.find((c) => c.id === clientId)?.display_name : null;

  const href = (m: string) => {
    const p = new URLSearchParams();
    if (m !== 'all') p.set('method', m);
    if (clientId) p.set('client', clientId);
    if (q) p.set('q', q);
    return `/payments${p.size ? `?${p}` : ''}`;
  };

  return (
    <Page
      title="Payments"
      subtitle={clientName ? `From ${clientName}` : `${plural(inRange(cur).length, 'payment')} this fiscal year`}
      wide
      actions={<PaymentsActions clients={must(clientRes).map((c) => ({ id: c.id, name: c.display_name }))} clientId={clientId} data={data} />}
      toolbar={<ListToolbar id="payments" value={method.value} searchPlaceholder="Reference, client or invoice" options={METHOD_FILTERS.map((m) => ({ value: m.value, label: m.label, href: href(m.value) }))} />}
    >
      <SummaryStrip
        stats={[
          { label: `Received · FY${fy}`, value: sum(inRange(cur)), sub: `FY${fy - 1}: ${money(sum(inRange(prev)), 'CAD', { cents: false })}` },
          { label: 'This month', value: sum(thisMonth), sub: plural(thisMonth.length, 'payment') },
          { label: 'Not applied', value: unapplied, sub: unapplied > 0 ? 'Received but not matched to an invoice' : 'Everything is matched to invoices' },
        ]}
      />
      <PaymentsList
        rows={rows}
        data={data}
        empty={q || clientId || method.value !== 'all' ? (
          <EmptyState icon={<SearchX />} title="No payments match" message="Try another method, client or reference." action={<Button href="/payments" variant="tinted">Show all payments</Button>} />
        ) : (
          <EmptyState icon={<HandCoins />} title="No payments yet" message="When a client pays, record it here and it’s applied to their oldest invoices automatically." action={<Button href="/payments?new=1" variant="filled">Record payment</Button>} />
        )}
      />
    </Page>
  );
}
