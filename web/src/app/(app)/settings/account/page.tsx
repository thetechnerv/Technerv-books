import { Page } from '@/components/ui/page';
import { Section, Row } from '@/components/ui/group';
import { Avatar } from '@/components/ui/avatar';
import { SignOutRow } from '@/components/settings/sign-out';
import { currentMember } from '@/lib/session';
import { devBypass } from '@/lib/db';
import { date } from '@/lib/format';

export const metadata = { title: 'Account' };

export default async function AccountSettings() {
  const devBypassEmail = await devBypass();
  const me = await currentMember();
  return (
    <Page title="Account" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <div className="mb-7 flex flex-col items-center pt-2 text-center">
          <Avatar name={me.full_name} color={me.color} initials={me.initials} size={84} />
          <p className="mt-3 text-title2 font-bold">{me.full_name}</p>
          <p className="text-subhead text-label-2">{me.email}</p>
        </div>

        <Section title="Signed in as">
          <Row title="Name" value={me.full_name} />
          <Row title="Email" value={me.email} />
          <Row title="Role" value={me.role.charAt(0).toUpperCase() + me.role.slice(1)} />
          {me.ownership_pct !== null && <Row title="Ownership" value={`${Number(me.ownership_pct)}%`} />}
          <Row title="Member since" value={date(me.created_at)} />
          <Row href="/settings/members" title="Edit profile" />
        </Section>

        <Section title="PIN" footer={me.password_changed_at ? `Last changed ${date(me.password_changed_at)}. Forgot it? Another owner can give you a one-time code in Settings → Members.` : 'Forgot it? Another owner can give you a one-time code in Settings → Members.'}>
          <Row href="/set-password?next=/settings/account" title="Change PIN" />
        </Section>

        <Section footer={devBypassEmail
          ? `Sign-in is skipped in local development: the app acts as ${devBypassEmail} (DEV_AUTH_BYPASS_EMAIL in .env.local). In production you sign in with your email and 4-digit PIN.`
          : 'Sign back in with your email and PIN.'}
        >
          <SignOutRow disabled={!!devBypassEmail} />
        </Section>
      </div>
    </Page>
  );
}
