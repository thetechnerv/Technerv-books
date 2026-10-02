import { gunzipSync, gzipSync } from 'node:zlib';
import { NextResponse, type NextRequest } from 'next/server';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { putServerFile } from '@/lib/storage';

const MAX = 15 * 1024 * 1024;
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/**
 * GET  /api/banking/imports/<batch id>[?download=1] — the original statement file, un-gzipped.
 * POST /api/banking/imports/<batch id>               — body = the original file; stored gzipped at bank/imports/<id>.csv.gz.
 * Members only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  if (!isId(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await db();
  const batch = must(await supabase.from('import_batches').select('file_name, file_path').eq('id', id).maybeSingle());
  if (!batch?.file_path) return new NextResponse('Not found', { status: 404 });
  const { data, error } = await supabase.storage.from('accounts').download(batch.file_path);
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  const body = new Uint8Array(gunzipSync(Buffer.from(await data.arrayBuffer())));
  const download = req.nextUrl.searchParams.get('download') === '1';
  const name = batch.file_name.replace(/["\r\n]/g, '');
  return new NextResponse(body, {
    headers: {
      'Content-Type': /\.(ofx|qfx)$/i.test(name) ? 'application/x-ofx' : 'text/csv; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ ok: false, error: 'Import not found.' }, { status: 404 });
  const supabase = await db();
  const batch = must(await supabase.from('import_batches').select('id, file_path').eq('id', id).maybeSingle());
  if (!batch) return NextResponse.json({ ok: false, error: 'Import not found.' }, { status: 404 });
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!raw.byteLength || raw.byteLength > MAX) return NextResponse.json({ ok: false, error: 'File is empty or too large.' }, { status: 400 });
  const path = `bank/imports/${id}.csv.gz`;
  await putServerFile(path, new Uint8Array(gzipSync(raw, { level: 9 })), 'application/gzip');
  // Normally set when the batch was created; only older batches need it written now.
  if (batch.file_path !== path) must(await supabase.from('import_batches').update({ file_path: path }).eq('id', id).select('id'));
  return NextResponse.json({ ok: true, path, size: raw.byteLength });
}
