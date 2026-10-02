import { Page } from '@/components/ui/page';
import { InstallGuide } from '@/components/shell/install-guide';

export const metadata = { title: 'Install on your phone' };

export default function InstallPage() {
  return (
    <Page title="Install on your phone" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <InstallGuide />
      </div>
    </Page>
  );
}
