import { Section } from '@/components/ui/group';
import { SettingsPage, TextField, SelectField } from '@/components/settings/settings-form';
import { PROVINCES, TIMEZONES } from '@/components/settings/validate';
import { businessProfile } from '@/lib/session';
import { saveProfile } from '../actions';

export const metadata = { title: 'Company' };

export default async function CompanySettings() {
  const p = await businessProfile();
  return (
    <SettingsPage title="Company" action={saveProfile}>
      <Section title="Name" footer="The legal name appears on invoices, tax forms and exports. The operating name is what people see in the app.">
        <TextField name="legal_name" label="Legal name" defaultValue={p.legal_name} autoComplete="organization" />
        <TextField name="operating_name" label="Operating name" defaultValue={p.operating_name ?? ''} placeholder="Optional" />
      </Section>

      <Section title="Registration" footer="Your GST/HST account is your business number followed by RT and a 4-digit reference.">
        <TextField name="business_number" label="Business number" defaultValue={p.business_number ?? ''} inputMode="numeric" placeholder="123456789" maxLength={11} />
        <TextField name="gst_number" label="GST/HST number" defaultValue={p.gst_number ?? ''} placeholder="123456789 RT0001" autoCapitalize="characters" maxLength={18} />
        <TextField name="bc_incorporation_number" label="BC incorporation no." defaultValue={p.bc_incorporation_number ?? ''} placeholder="BC1234567" autoCapitalize="characters" maxLength={12} />
        <TextField name="incorporated_on" label="Incorporated" type="date" defaultValue={p.incorporated_on ?? ''} />
      </Section>

      <Section title="Address">
        <TextField name="address_line1" label="Street" defaultValue={p.address_line1 ?? ''} autoComplete="address-line1" />
        <TextField name="address_line2" label="Unit / suite" defaultValue={p.address_line2 ?? ''} placeholder="Optional" autoComplete="address-line2" />
        <TextField name="city" label="City" defaultValue={p.city ?? ''} autoComplete="address-level2" />
        <SelectField name="province" label="Province" defaultValue={p.province} options={PROVINCES.map(([v, l]) => ({ value: v, label: l }))} />
        <TextField name="postal_code" label="Postal code" defaultValue={p.postal_code ?? ''} placeholder="V2C 1X8" autoCapitalize="characters" autoComplete="postal-code" maxLength={7} />
      </Section>

      <Section title="Contact" footer="Shown on invoices and estimates.">
        <TextField name="email" label="Email" type="email" defaultValue={p.email ?? ''} inputMode="email" autoComplete="email" />
        <TextField name="phone" label="Phone" type="tel" defaultValue={p.phone ?? ''} inputMode="tel" autoComplete="tel" />
        <TextField name="website" label="Website" defaultValue={p.website ?? ''} inputMode="url" autoCapitalize="none" placeholder="technerv.com" />
      </Section>

      <Section title="Time" footer="Used for “today”, greetings and due dates.">
        <SelectField name="timezone" label="Time zone" defaultValue={p.timezone} options={TIMEZONES.map(([v, l]) => ({ value: v, label: l }))} />
      </Section>
    </SettingsPage>
  );
}
