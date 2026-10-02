import { notFound, redirect } from 'next/navigation';
import { InvoiceEditor } from '@/components/invoices/editor';
import { newKey } from '@/components/invoices/shared';
import { editorData } from '@/components/invoices/editor-data';
import { db, must } from '@/lib/db';

export const metadata = { title: 'Edit invoice' };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await db();
  const [data, inv, lines] = await Promise.all([
    editorData(),
    supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('sort'),
  ]);
  const doc = must(inv);
  if (!doc) notFound();
  if (doc.status === 'void') redirect(`/invoices/${id}`);

  return (
    <InvoiceEditor
      data={data}
      backHref={`/invoices/${id}`}
      initial={{
        id: doc.id, kind: doc.kind, number: doc.number, status: doc.status, revision: doc.revision,
        client_id: doc.client_id, project_id: doc.project_id, title: doc.title ?? '', po_number: doc.po_number ?? '',
        issue_date: doc.issue_date, due_date: doc.due_date, discount: Number(doc.discount) ? String(doc.discount) : '',
        notes: doc.notes ?? '', terms: doc.terms ?? '', converted_from: doc.converted_from, recurring_id: doc.recurring_id,
        lines: must(lines).map((l) => ({
          key: newKey(), item_id: l.item_id, description: l.description, detail: l.detail ?? '', quantity: String(Number(l.quantity)),
          unit: l.unit ?? '', unit_price: String(Number(l.unit_price)), tax_rate_id: l.tax_rate_id,
        })),
      }}
    />
  );
}
