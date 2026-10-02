import { NextResponse, type NextRequest } from 'next/server';
import { format, isValid, parseISO } from 'date-fns';
import { currentMember, businessProfile } from '@/lib/session';
import { reportingFy } from '@/components/clients/data';
import { buildStatement } from '@/components/clients/statement';
import { renderStatementPdf } from '@/components/clients/statement-pdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const okDate = (v: string | null) => !!v && ISO.test(v) && isValid(parseISO(v));

/**
 * GET /api/clients/<id>/statement?from=YYYY-MM-DD&to=YYYY-MM-DD[&download=1]
 * Statement of account PDF. Defaults to the reporting fiscal year up to today.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });
  const sp = req.nextUrl.searchParams;
  const profile = await businessProfile();
  const today = format(new Date(), 'yyyy-MM-dd');
  const fy = reportingFy(profile.fiscal_year_end);
  const from = okDate(sp.get('from')) ? sp.get('from')! : fy.start;
  const to = okDate(sp.get('to')) ? sp.get('to')! : today;
  if (from > to) return new NextResponse('“from” must be on or before “to”.', { status: 400 });

  const statement = await buildStatement(id, from, to);
  if (!statement) return new NextResponse('Not found', { status: 404 });

  const pdf = await renderStatementPdf(statement);
  const safeName = (statement.client.display_name).replace(/[^\p{L}\p{N} &.-]+/gu, '').trim();
  const fileName = `Statement - ${safeName} - ${to}.pdf`;
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '');
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${sp.get('download') === '1' ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
