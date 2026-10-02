import { redirect } from 'next/navigation';
import { adminDb, devBypass, sessionClient } from '@/lib/db';
import { SetPasswordForm } from './form';

export const metadata = { title: 'Choose a PIN' };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await devBypass()) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center text-subhead text-label-2">
        Sign-in is skipped in local development, so there’s no PIN to change here. Use the deployed app.
      </div>
    );
  }
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  const { data: member } = await adminDb().from('members').select('full_name, must_change_password, temp_password_expires_at, active').ilike('email', user.email).maybeSingle();
  if (!member?.active) redirect('/login?error=not-a-member');
  return <SetPasswordForm firstTime={member.must_change_password} name={member.full_name.split(' ')[0]!} email={user.email} next={next ?? '/'} />;
}
