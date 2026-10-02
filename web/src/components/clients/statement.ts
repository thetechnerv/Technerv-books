import 'server-only';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { db, must } from '@/lib/db';
import { num, round2 } from '@/lib/format';
import type { Row } from '@/lib/types';

export type StatementLine = {
  date: string;
  kind: 'invoice' | 'credit_note' | 'credit_applied' | 'payment';
  ref: string;
  title: string;
  detail: string | null;
  due: string | null;
  charge: number;
  credit: number;
  balance: number;
};

export type AgingBucket = { key: 'current' | 'd30' | 'd60' | 'd90' | 'd90p'; label: string; amount: number };
export type OpenItem = { number: string; title: string | null; issued: string; due: string | null; total: number; balance: number; daysOverdue: number };

export type Statement = {
  client: Row<'clients'>;
  business: Row<'business_profile'>;
  currency: string;
  from: string;
  to: string;
  opening: number;
  charges: number;
  credits: number;
  closing: number;
  lines: StatementLine[];
  aging: AgingBucket[];
  unapplied: number;      // credits not yet applied to an invoice (as of `to`)
  openItems: OpenItem[];
};

const METHOD: Record<string, string> = {
  etransfer: 'Interac e-Transfer', eft: 'EFT', wire: 'Wire transfer', cheque: 'Cheque', card: 'Card', cash: 'Cash', stripe: 'Stripe', other: 'Payment',
};
const ORDER: Record<StatementLine['kind'], number> = { invoice: 0, credit_note: 1, credit_applied: 2, payment: 3 };

/**
 * Balance-forward statement of account in the client's currency.
 * Charges: issued invoices. Credits: payments received and credit notes.
 * A credit note that has been applied (amount_paid) is shown with a matching
 * "applied" line so the running balance agrees with the open invoices.
 */
export async function buildStatement(clientId: string, from: string, to: string): Promise<Statement | null> {
  const supabase = await db();
  const [clientRes, bizRes, docsRes, paysRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('business_profile').select('*').single(),
    supabase.from('invoices').select('id, kind, number, title, issue_date, due_date, total, amount_paid, notes, currency, status')
      .eq('client_id', clientId).in('kind', ['invoice', 'credit_note']).not('status', 'in', '(draft,void)').lte('issue_date', to)
      .order('issue_date').order('number'),
    supabase.from('payments').select('id, received_on, amount, currency, method, reference, payment_allocations(amount, invoice_id)')
      .eq('client_id', clientId).lte('received_on', to).order('received_on'),
  ]);
  const client = must(clientRes);
  if (!client) return null;
  const business = must(bizRes);
  const docs = must(docsRes);
  const pays = must(paysRes);
  const numberById = new Map(docs.map((d) => [d.id, d.number]));

  const events: Omit<StatementLine, 'balance'>[] = [];
  for (const d of docs) {
    if (d.kind === 'invoice') {
      events.push({ date: d.issue_date, kind: 'invoice', ref: d.number, title: `Invoice ${d.number}`, detail: d.title, due: d.due_date, charge: num(d.total), credit: 0 });
    } else {
      events.push({ date: d.issue_date, kind: 'credit_note', ref: d.number, title: `Credit note ${d.number}`, detail: d.title, due: null, charge: 0, credit: num(d.total) });
      if (num(d.amount_paid) > 0) {
        events.push({ date: d.issue_date, kind: 'credit_applied', ref: d.number, title: `Credit ${d.number} applied`, detail: d.notes, due: null, charge: num(d.amount_paid), credit: 0 });
      }
    }
  }
  for (const p of pays) {
    const applied = (p.payment_allocations ?? []).map((a) => numberById.get(a.invoice_id)).filter(Boolean);
    events.push({
      date: p.received_on, kind: 'payment', ref: p.reference ?? '', title: 'Payment received',
      detail: [METHOD[p.method] ?? 'Payment', p.reference, applied.length ? `for ${applied.join(', ')}` : null].filter(Boolean).join(' · '),
      due: null, charge: 0, credit: num(p.amount),
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || a.ref.localeCompare(b.ref));

  let opening = 0;
  const lines: StatementLine[] = [];
  let running = 0;
  for (const e of events) {
    if (e.date < from) { opening += e.charge - e.credit; continue; }
    if (!lines.length) running = opening;
    running += e.charge - e.credit;
    lines.push({ ...e, balance: round2(running) });
  }
  opening = round2(opening);
  const charges = round2(lines.reduce((s, l) => s + l.charge, 0));
  const credits = round2(lines.reduce((s, l) => s + l.credit, 0));
  const closing = round2(opening + charges - credits);

  // ── Aging as of `to`: what each invoice still owed on that date ──
  const paidAsOf = new Map<string, number>();
  let unallocated = 0;
  for (const p of pays) {
    let used = 0;
    for (const a of p.payment_allocations ?? []) {
      paidAsOf.set(a.invoice_id, (paidAsOf.get(a.invoice_id) ?? 0) + num(a.amount));
      used += num(a.amount);
    }
    unallocated += Math.max(0, num(p.amount) - used);
  }
  const buckets: AgingBucket[] = [
    { key: 'current', label: 'Current', amount: 0 },
    { key: 'd30', label: '1–30 days', amount: 0 },
    { key: 'd60', label: '31–60 days', amount: 0 },
    { key: 'd90', label: '61–90 days', amount: 0 },
    { key: 'd90p', label: 'Over 90 days', amount: 0 },
  ];
  const openItems: OpenItem[] = [];
  const asOf = parseISO(to);
  let unappliedCredits = 0;
  for (const d of docs) {
    if (d.kind === 'credit_note') { unappliedCredits += Math.max(0, num(d.total) - num(d.amount_paid)); continue; }
    const bal = round2(num(d.total) - (paidAsOf.get(d.id) ?? 0));
    if (bal <= 0.004) continue;
    const late = d.due_date ? differenceInCalendarDays(asOf, parseISO(d.due_date)) : 0;
    const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    buckets[b]!.amount += bal;
    openItems.push({ number: d.number, title: d.title, issued: d.issue_date, due: d.due_date, total: num(d.total), balance: bal, daysOverdue: Math.max(0, late) });
  }
  buckets.forEach((b) => (b.amount = round2(b.amount)));

  return {
    client, business, currency: client.currency, from, to,
    opening, charges, credits, closing, lines,
    aging: buckets,
    unapplied: round2(unappliedCredits + unallocated),
    openItems: openItems.sort((a, b) => a.issued.localeCompare(b.issued)),
  };
}
