import { addDays, format, parseISO } from 'date-fns';
import { InvoiceEditor, type EditorInitial } from '@/components/invoices/editor';
import { editorData } from '@/components/invoices/editor-data';
import { bumpMonthNames, KIND_LABEL, newKey } from '@/components/invoices/shared';
import { db, must } from '@/lib/db';
import type { InvoiceKind } from '@/lib/types';

export const metadata = { title: 'New invoice' };

const KINDS: InvoiceKind[] = ['invoice', 'estimate', 'credit_note'];
const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kind?: string; client?: string; from?: string; project?: string; expenses?: string }> }) {
  const sp = await searchParams;
  const supabase = await db();
  const data = await editorData();
  const today = data.defaults.today;

  const src = sp.from && UUID.test(sp.from) ? must(await supabase.from('invoices').select('*').eq('id', sp.from).maybeSingle()) : null;
  const kind: InvoiceKind = KINDS.includes(sp.kind as InvoiceKind) ? (sp.kind as InvoiceKind) : src && !sp.kind ? src.kind : 'invoice';
  const clientId = src?.client_id ?? (sp.client && data.clients.some((c) => c.id === sp.client) ? sp.client : null);
  const client = data.clients.find((c) => c.id === clientId) ?? null;

  const days = kind === 'estimate' ? data.defaults.estimateValidDays : client?.terms_days ?? data.defaults.termsDays;
  const due = kind === 'credit_note' ? null : format(addDays(parseISO(today), days), 'yyyy-MM-dd');

  let initial: EditorInitial = {
    kind, client_id: clientId, project_id: null, title: '', po_number: '', issue_date: today, due_date: due,
    discount: '', notes: '', terms: '', lines: [],
  };

  if (src) {
    const lines = must(await supabase.from('invoice_lines').select('*').eq('invoice_id', src.id).order('sort'));
    const same = src.kind === kind;
    const now = parseISO(today);
    const bump = (t: string | null) => (same ? bumpMonthNames(t, now) : t) ?? '';
    initial = {
      ...initial,
      project_id: src.project_id,
      title: kind === 'credit_note' && !same ? `Credit for ${src.number}` : bump(src.title),
      po_number: kind === 'credit_note' ? '' : src.po_number ?? '',
      discount: Number(src.discount) ? String(src.discount) : '',
      notes: same ? src.notes ?? '' : '',
      terms: same ? src.terms ?? '' : '',
      converted_from: same ? null : src.id,
      source_label: same ? `Copy of ${src.number}` : `From ${KIND_LABEL[src.kind].toLowerCase()} ${src.number}`,
      lines: lines.map((l) => ({
        key: newKey(), item_id: l.item_id, description: bump(l.description), detail: l.detail ?? '', quantity: String(Number(l.quantity)),
        unit: l.unit ?? '', unit_price: String(Number(l.unit_price)), tax_rate_id: l.tax_rate_id,
      })),
    };
  } else if (client) {
    initial.lines = [{ key: newKey(), item_id: null, description: '', detail: '', quantity: '1', unit: '', unit_price: '', tax_rate_id: client.default_tax_rate_id }];
  }

  // Deep links from Clients: ?project=<id> and ?expenses=<id,id> (re-bill billable expenses).
  if (!src && sp.project && UUID.test(sp.project)) {
    const p = data.projects.find((x) => x.id === sp.project && (!clientId || x.client_id === clientId));
    if (p) {
      initial.project_id = p.id;
      if (!initial.client_id && p.client_id) initial.client_id = p.client_id;
    }
  }
  const expenseIds = (sp.expenses ?? '').split(',').map((x) => x.trim()).filter((x) => UUID.test(x)).slice(0, 100);
  if (!src && expenseIds.length) {
    const exps = must(await supabase.from('expenses').select('id, vendor, description, subtotal, total, gst_hst, pst, fx_rate, billed_invoice_id, spent_on').in('id', expenseIds).order('spent_on'));
    const open = exps.filter((e) => !e.billed_invoice_id);
    const tax = data.clients.find((c) => c.id === initial.client_id)?.default_tax_rate_id ?? null;
    const expLines = open.map((e) => {
      const pre = Number(e.subtotal) || Number(e.total) - Number(e.gst_hst) - Number(e.pst);
      return {
        key: newKey(), item_id: null, description: [e.vendor, e.description].filter(Boolean).join(' — '), detail: '',
        quantity: '1', unit: '', unit_price: String(Math.round(pre * Number(e.fx_rate || 1) * 100) / 100), tax_rate_id: tax,
      };
    });
    if (expLines.length) {
      initial.lines = [...initial.lines.filter((l) => l.description || l.unit_price), ...expLines];
      initial.bill_expense_ids = open.map((e) => e.id);
      initial.source_label = `Re-billing ${open.length} expense${open.length === 1 ? '' : 's'}`;
    }
  }

  const back = src ? `/invoices/${src.id}` : kind === 'estimate' ? '/estimates' : '/invoices';
  return <InvoiceEditor data={data} initial={initial} backHref={back} />;
}
