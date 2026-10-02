import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';

/** GET /api/settings/logo — the company's uploaded invoice logo (members only). 404 when using the Tech Nerv mark. */
export async function GET() {
  await currentMember();
  const profile = await businessProfile();
  if (!profile.logo_path) return new NextResponse('No logo', { status: 404 });
  const supabase = await db();
  const { data, error } = await supabase.storage.from('accounts').download(profile.logo_path);
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(data, {
    headers: {
      'Content-Type': profile.logo_path.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
