import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';

export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  amount?: number;
  currency?: string;
  status?: string;
  overdue?: boolean;
};
export type SearchGroup = { key: string; label: string; items: SearchItem[] };

/**
 * GET /api/search?q= — members only. Matches clients, invoices & estimates,
 * expenses, payments and documents. Amount-looking queries ("1,250" or "$85.50")
 * also match totals exactly.
 */
export async function GET(req: NextRequest) {
  await currentMember();
  const raw = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  // Strip characters that have meaning in PostgREST filter strings.
  const q = raw.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2 && !/^\d$/.test(q)) return NextResponse.json({ q: raw, groups: [] });

  const like = `%${q}%`;
  const amountMatch = /^\$?\s?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(raw.trim()) ? Number(raw.replace(/[$,\s]/g, '')) : null;
  const supabase = await db();

  const [clients, invoices, expenses, payments, documents] = await Promise.all([
    supabase.from('clients')
      .select('id, display_name, company_name, contact_name, email, city, archived')
      .or(`display_name.ilike.${like},company_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`)
      .order('archived').order('display_name').limit(6),
    supabase.from('invoice_overview')
      .select('id, kind, number, title, client_name, total, currency, status, is_overdue, issue_date')
      .or([`number.ilike.${like}`, `title.ilike.${like}`, `client_name.ilike.${like}`, `po_number.ilike.${like}`, amountMatch !== null && `total.eq.${amountMatch}`, amountMatch !== null && `subtotal.eq.${amountMatch}`].filter(Boolean).join(','))
      .order('issue_date', { ascending: false }).limit(8),
    supabase.from('expense_overview')
      .select('id, vendor, description, total, currency, spent_on, category_name, nature')
      .or([`vendor.ilike.${like}`, `description.ilike.${like}`, `category_name.ilike.${like}`, amountMatch !== null && `total.eq.${amountMatch}`, amountMatch !== null && `subtotal.eq.${amountMatch}`].filter(Boolean).join(','))
      .order('spent_on', { ascending: false }).limit(8),
    supabase.from('payments')
      .select('id, reference, amount, currency, received_on, method, notes, clients(display_name)')
      .or([`reference.ilike.${like}`, `notes.ilike.${like}`, amountMatch !== null && `amount.eq.${amountMatch}`].filter(Boolean).join(','))
      .order('received_on', { ascending: false }).limit(6),
    supabase.from('documents')
      .select('id, title, doc_type, fiscal_year, issued_on')
      .or(`title.ilike.${like},notes.ilike.${like},doc_type.ilike.${like}`)
      .order('issued_on', { ascending: false, nullsFirst: false }).limit(6),
  ]);

  // Payments whose client matches the query, so "northwind" finds their payments too.
  const clientIds = (clients.data ?? []).map((c) => c.id);
  const clientPayments = clientIds.length
    ? await supabase.from('payments').select('id, reference, amount, currency, received_on, method, notes, clients(display_name)').in('client_id', clientIds).order('received_on', { ascending: false }).limit(4)
    : { data: [] as NonNullable<typeof payments.data> };
  const allPayments = [...(payments.data ?? []), ...(clientPayments.data ?? []).filter((p) => !(payments.data ?? []).some((x) => x.id === p.id))].slice(0, 6);

  const kindLabel = { invoice: 'Invoice', estimate: 'Estimate', credit_note: 'Credit note' } as Record<string, string>;
  const fmtDate = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const method = (m: string) => ({ etransfer: 'e-Transfer', eft: 'EFT', wire: 'Wire', cheque: 'Cheque', card: 'Card', cash: 'Cash', stripe: 'Stripe', other: 'Other' } as Record<string, string>)[m] ?? m;

  const groups: SearchGroup[] = [
    {
      key: 'clients', label: 'Clients',
      items: (clients.data ?? []).map((c) => ({
        id: c.id, title: c.display_name, href: `/clients/${c.id}`,
        subtitle: [c.company_name !== c.display_name && c.company_name, c.contact_name, c.email, c.archived && 'Archived'].filter(Boolean).join(' · ') || c.city || undefined,
      })),
    },
    {
      key: 'invoices', label: 'Invoices & estimates',
      items: (invoices.data ?? []).map((i) => ({
        id: i.id!, title: `${i.number}${i.title ? ` · ${i.title}` : ''}`, href: `/invoices/${i.id}`,
        subtitle: [kindLabel[i.kind!] ?? i.kind, i.client_name, fmtDate(i.issue_date)].filter(Boolean).join(' · '),
        amount: Number(i.total), currency: i.currency ?? 'CAD', status: i.status ?? undefined, overdue: !!i.is_overdue,
      })),
    },
    {
      key: 'expenses', label: 'Expenses',
      items: (expenses.data ?? []).map((e) => ({
        id: e.id!, title: e.vendor!, href: `/expenses/${e.id}`,
        subtitle: [e.description, e.category_name, fmtDate(e.spent_on)].filter(Boolean).join(' · '),
        amount: Number(e.total), currency: e.currency ?? 'CAD', status: e.nature === 'business' ? undefined : e.nature ?? undefined,
      })),
    },
    {
      key: 'payments', label: 'Payments',
      items: allPayments.map((p) => {
        const client = (p.clients as { display_name: string } | null)?.display_name;
        return {
          id: p.id, title: p.reference ? `${method(p.method)} · ${p.reference}` : `${method(p.method)} from ${client ?? 'client'}`, href: `/payments?id=${p.id}`,
          subtitle: [client, fmtDate(p.received_on)].filter(Boolean).join(' · '),
          amount: Number(p.amount), currency: p.currency,
        };
      }),
    },
    {
      key: 'documents', label: 'Documents',
      items: (documents.data ?? []).map((d) => ({
        id: d.id, title: d.title, href: `/documents?id=${d.id}`,
        subtitle: [d.doc_type.replace(/_/g, ' '), d.fiscal_year && `FY${d.fiscal_year}`].filter(Boolean).join(' · '),
      })),
    },
  ].filter((g) => g.items.length);

  const failed = [clients, invoices, expenses, payments, documents].find((r) => r.error);
  return NextResponse.json({ q: raw, groups, ...(failed?.error ? { warning: failed.error.message } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
