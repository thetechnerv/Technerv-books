import { cookies } from 'next/headers';
import { Page } from '@/components/ui/page';
import { Section } from '@/components/ui/group';
import { AppearancePicker } from '@/components/settings/appearance';

export const metadata = { title: 'Appearance' };

export default async function AppearanceSettings() {
  const theme = (await cookies()).get('theme')?.value;
  return (
    <Page title="Appearance" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <Section title="Theme" footer="Saved on this device for a year. System follows your phone or computer’s light and dark setting.">
          <AppearancePicker current={theme === 'light' || theme === 'dark' ? theme : 'system'} />
        </Section>
      </div>
    </Page>
  );
}
