import { Page } from '@/components/ui/page';
import { Members } from '@/components/settings/members';
import { SignInAccess } from '@/components/settings/sign-in-access';
import { allMembers, currentMember } from '@/lib/session';

export const metadata = { title: 'Members' };

export default async function MembersSettings() {
  const [me, members] = await Promise.all([currentMember(), allMembers()]);
  return (
    <Page title="Members" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <Members members={members} meId={me.id} />
        <SignInAccess members={members} meId={me.id} isOwner={me.role === 'owner'} />
      </div>
    </Page>
  );
}
