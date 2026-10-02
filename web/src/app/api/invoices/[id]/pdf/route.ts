import { NextResponse, type NextRequest } from 'next/server';
import { currentMember } from '@/lib/session';
import { db, must } from '@/lib/db';
import { invoicePdfModel } from '@/components/pdf/load';
import { pdfFileName, renderInvoicePdf } from '@/components/pdf/render';

export const runtime = 'nodejs';

/**
 * GET /api/invoices/<id>/pdf[?rev=<n>][&download=1][&archived=1]
 * Renders the invoice (or an earlier revision) to PDF. `archived=1` streams the
 * copy saved to records instead of re-rendering. Members only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const sp = req.nextUrl.searchParams;
  const download = sp.get('download') === '1';
  const disposition = (name: string) => `${download ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`;

  if (sp.get('archived') === '1') {
    const supabase = await db();
    const inv = must(await supabase.from('invoices').select('archived_pdf_path, number').eq('id', id).maybeSingle());
    if (!inv?.archived_pdf_path) return new NextResponse('No saved copy', { status: 404 });
    const { data, error } = await supabase.storage.from('accounts').download(inv.archived_pdf_path);
    if (error || !data) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(data, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(inv.archived_pdf_path.split('/').pop()!), 'Cache-Control': 'private, max-age=60' },
    });
  }

  const revRaw = sp.get('rev');
  const rev = revRaw && /^\d+$/.test(revRaw) ? Number(revRaw) : null;
  const model = await invoicePdfModel(id, rev);
  if (!model) return new NextResponse('Not found', { status: 404 });
  const pdf = await renderInvoicePdf(model);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition(pdfFileName(model)),
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
