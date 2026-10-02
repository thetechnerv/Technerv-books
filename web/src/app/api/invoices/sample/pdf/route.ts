import { NextResponse, type NextRequest } from 'next/server';
import { currentMember } from '@/lib/session';
import { samplePdfModel } from '@/components/pdf/load';
import { renderInvoicePdf } from '@/components/pdf/render';

export const runtime = 'nodejs';

/**
 * GET /api/invoices/sample/pdf?theme=studio|midnight|minimal&accent=%2303DDAA&logo=0|1
 * A realistic sample invoice using the company profile with the given
 * overrides — used by Settings for a live theme preview. Members only.
 */
export async function GET(req: NextRequest) {
  await currentMember();
  const sp = req.nextUrl.searchParams;
  const logo = sp.get('logo');
  const model = await samplePdfModel({
    theme: sp.get('theme'),
    accent: sp.get('accent'),
    logo: logo === '1' ? true : logo === '0' ? false : null,
    long: process.env.NODE_ENV === 'development' && sp.get('long') === '1',
  });
  const pdf = await renderInvoicePdf(model);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${sp.get('download') === '1' ? 'attachment' : 'inline'}; filename="sample-invoice-${model.theme}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
