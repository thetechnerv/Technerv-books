import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';

/**
 * GET /api/files?id=<attachment id>[&download=1]
 * Streams a stored attachment, transparently un-gzipping files that were
 * compressed on upload. Members only (RLS + session check).
 */
export async function GET(req: NextRequest) {
  await currentMember();
  const id = req.nextUrl.searchParams.get('id');
  const download = req.nextUrl.searchParams.get('download') === '1';
  if (!id) return new NextResponse('Missing id', { status: 400 });
  const supabase = await db();
  const { data: att } = await supabase.from('attachments').select('*').eq('id', id).maybeSingle();
  if (!att) return new NextResponse('Not found', { status: 404 });
  const { data: blob, error } = await supabase.storage.from('accounts').download(att.storage_path);
  if (error || !blob) return new NextResponse('Not found', { status: 404 });
  let body: ReadableStream | Blob = blob;
  let name = att.file_name;
  if (att.compression === 'gzip') {
    body = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    name = name.replace(/\.gz$/, '');
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': att.mime_type ?? 'application/octet-stream',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // SVGs are shown as images; never let one run script if opened directly.
      ...(att.mime_type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
