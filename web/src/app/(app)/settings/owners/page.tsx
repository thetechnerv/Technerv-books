import { Section } from '@/components/ui/group';
import { SettingsPage, TextField } from '@/components/settings/settings-form';
import { businessProfile } from '@/lib/session';
import { saveProfile } from '../actions';

export const metadata = { title: 'Owners & loans' };

export default async function OwnersSettings() {
  const p = await businessProfile();
  return (
    <SettingsPage title="Owners & loans" action={saveProfile}>
      <Section
        title="Shareholder loans"
        footer="When an owner owes the company money (for example personal spending on the business card), CRA generally adds it to their income unless it’s repaid within one year after the end of the company’s tax year in which it arose. Owner balances warn you once a balance has been owed this many days, so there’s time to repay or declare it."
      >
        <TextField name="shareholder_loan_alert_days" label="Alert after" defaultValue={String(p.shareholder_loan_alert_days)} inputMode="numeric" align="right" trailing="days" />
      </Section>
    </SettingsPage>
  );
}
