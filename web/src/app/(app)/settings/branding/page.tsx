import { Section } from '@/components/ui/group';
import { TextArea } from '@/components/ui/fields';
import { SettingsPage, TextField } from '@/components/settings/settings-form';
import { LogoPicker, InvoiceLook, Numbering } from '@/components/settings/branding';
import { businessProfile } from '@/lib/session';
import { db, must } from '@/lib/db';
import { saveProfile } from '../actions';

export const metadata = { title: 'Branding & invoices' };

export default async function BrandingSettings() {
  const [p, supabase] = await Promise.all([businessProfile(), db()]);
  const numbers = must(await supabase.from('invoices').select('kind, number').in('kind', ['invoice', 'estimate']));
  const used = (k: string) => numbers.filter((n) => n.kind === k).map((n) => n.number);

  return (
    <SettingsPage title="Branding & invoices" action={saveProfile}>
      <Section title="Logo" footer="Uploading or resetting the logo takes effect right away — you can undo it from the confirmation.">
        <LogoPicker logoPath={p.logo_path} />
      </Section>

      <Section title="Invoice look">
        <InvoiceLook theme={p.invoice_theme} accent={p.invoice_accent} showLogo={p.invoice_show_logo} logoPath={p.logo_path} />
      </Section>

      <Section title="Wording" footer="The thank-you line sits above the totals; the footer runs along the bottom of every page.">
        <TextField name="invoice_thank_you" label="Thank-you line" defaultValue={p.invoice_thank_you ?? ''} placeholder="Thank you for your business." maxLength={200} />
        <TextField name="invoice_footer" label="Footer" defaultValue={p.invoice_footer ?? ''} maxLength={300} />
      </Section>

      <Section title="Getting paid" footer="Printed in the payment box on invoices. Bank details are shown exactly as typed.">
        <TextArea name="payment_instructions" label="Payment instructions" defaultValue={p.payment_instructions ?? ''} rows={3} maxLength={1000} />
        <TextField name="etransfer_email" label="e-Transfer email" type="email" inputMode="email" defaultValue={p.etransfer_email ?? ''} placeholder="accounts@technerv.com" />
        <TextArea name="bank_details" label="Bank details (EFT)" defaultValue={p.bank_details ?? ''} rows={2} maxLength={400} />
      </Section>

      <Section title="Invoice numbers">
        <Numbering kind="invoice" prefix={p.invoice_prefix} seq={p.next_invoice_seq} used={used('invoice')} />
      </Section>
      <Section title="Estimate numbers">
        <Numbering kind="estimate" prefix={p.estimate_prefix} seq={p.next_estimate_seq} used={used('estimate')} />
      </Section>

      <Section title="Defaults" footer="Payment terms set the due date on new invoices (0 = due on receipt). Clients can override them.">
        <TextField name="default_terms_days" label="Payment terms" defaultValue={String(p.default_terms_days)} inputMode="numeric" align="right" trailing="days" />
        <TextField name="estimate_valid_days" label="Estimates valid for" defaultValue={String(p.estimate_valid_days)} inputMode="numeric" align="right" trailing="days" />
      </Section>
    </SettingsPage>
  );
}
