import 'server-only';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { isoToday, num } from '@/lib/format';
import type { PaymentFormData } from './payment-sheet';

/**
 * Everything the record-payment sheet needs. Includes open invoices plus any
 * invoices already allocated by the payments being edited (so they stay editable).
 */
export async function paymentFormData(opts: { clientId?: string | null; paymentIds?: string[] } = {}): Promise<PaymentFormData> {
  const supabase = await db();
  let openQ = supabase.from('invoices').select('id, number, client_id, currency, issue_date, due_date, balance, total, title')
    .eq('kind', 'invoice').in('status', ['sent', 'partial', 'draft']).gt('balance', 0).order('issue_date');
  if (opts.clientId) openQ = openQ.eq('client_id', opts.clientId);
  const [profile, clients, open, accounts, rates, allocated] = await Promise.all([
    businessProfile(),
    supabase.from('clients').select('id, display_name, currency, archived').order('display_name'),
    openQ,
    supabase.from('money_accounts').select('id, name, currency, kind, archived').in('kind', ['bank', 'payment_processor', 'cash']).eq('archived', false).order('name'),
    supabase.from('fx_rates').select('currency, rate_date, rate_to_cad').order('rate_date', { ascending: false }).limit(400),
    opts.paymentIds?.length
      ? supabase.from('payment_allocations').select('invoice_id, invoices(id, number, client_id, currency, issue_date, due_date, balance, total, title)').in('payment_id', opts.paymentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const invs = new Map(must(open).map((i) => [i.id, i]));
  for (const a of must(allocated) as unknown as { invoices: (typeof invs extends Map<string, infer V> ? V : never) | null }[]) {
    if (a.invoices && !invs.has(a.invoices.id)) invs.set(a.invoices.id, a.invoices);
  }
  return {
    clients: must(clients).filter((c) => !c.archived).map(({ id, display_name, currency }) => ({ id, display_name, currency })),
    invoices: [...invs.values()].map((i) => ({ ...i, balance: num(i.balance), total: num(i.total) })).sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number)),
    accounts: must(accounts).map(({ id, name, currency, kind }) => ({ id, name, currency, kind })),
    rates: must(rates).map((r) => ({ currency: r.currency, date: r.rate_date, rate: num(r.rate_to_cad) })),
    lockBefore: profile.lock_books_before,
    today: isoToday(),
  };
}
