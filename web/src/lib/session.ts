import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { db, devBypass, must } from './db';
import type { Row } from './types';

/** The signed-in member, or a redirect to /login. Cached per request. */
export const currentMember = cache(async (): Promise<Row<'members'>> => {
  const supabase = await db();
  let email = await devBypass();
  if (!email) {
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  }
  if (!email) redirect('/login');
  const member = must(await supabase.from('members').select('*').ilike('email', email).eq('active', true).maybeSingle());
  if (!member) redirect('/login?error=not-a-member');
  // A temporary password must be replaced before the app can be used.
  if (member.must_change_password && !(await devBypass())) redirect('/set-password');
  return member;
});

export const businessProfile = cache(async (): Promise<Row<'business_profile'>> => {
  const supabase = await db();
  return must(await supabase.from('business_profile').select('*').single());
});

export const allMembers = cache(async () => {
  const supabase = await db();
  return must(await supabase.from('members').select('*').order('full_name'));
});
