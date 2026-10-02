import { Section } from '@/components/ui/group';
import { SettingsPage } from '@/components/settings/settings-form';
import { MileageRates } from '@/components/settings/mileage-rates';
import { businessProfile } from '@/lib/session';
import { saveProfile } from '../actions';

export const metadata = { title: 'Mileage' };

export default async function MileageSettings() {
  const p = await businessProfile();
  return (
    <SettingsPage title="Mileage" action={saveProfile}>
      <Section
        title="Per-kilometre allowance"
        footer={
          <>
            The company pays each owner this much per business kilometre driven in their own vehicle, tax-free, as long as it stays
            within CRA’s reasonable allowance. The 5,000 km tier counts each person’s trips per calendar year. In the Yukon, NWT and
            Nunavut CRA allows 4¢ more per km. Changing the rate applies to new trips; existing trips keep the rate they were logged at.
            {' '}<a className="text-accent-text" href="https://www.canada.ca/en/department-finance/news/2026/01/government-announces-the-2026-automobile-deduction-limits-and-expense-benefit-rates-for-businesses.html" target="_blank" rel="noreferrer">Source: Department of Finance Canada</a>
          </>
        }
      >
        <MileageRates first={Number(p.mileage_rate)} after={Number(p.mileage_rate_after_5000)} />
      </Section>
    </SettingsPage>
  );
}
