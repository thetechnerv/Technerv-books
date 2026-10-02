import { addDays, format, parseISO } from 'date-fns';
import { Section } from '@/components/ui/group';
import { Toggle } from '@/components/ui/fields';
import { SettingsPage, TextField, SelectField, Note } from '@/components/settings/settings-form';
import { TaxRates } from '@/components/settings/tax-rates';
import { CloseBooks, type CloseOption } from '@/components/settings/close-books';
import { businessProfile } from '@/lib/session';
import { db, must } from '@/lib/db';
import { fiscalYearOf, fiscalRange } from '@/lib/fiscal';
import { saveProfile } from '../actions';

export const metadata = { title: 'Tax' };

export default async function TaxSettings() {
  const [p, supabase] = await Promise.all([businessProfile(), db()]);
  const rates = must(await supabase.from('tax_rates').select('*').order('active', { ascending: false }).order('rate').order('code'));
  const allRates = await Promise.all(rates.map(async (r) => {
    const { count } = await supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('tax_rate_id', r.id);
    return { ...r, lines: count ?? 0 };
  }));

  // The last three fiscal years that have ended (not before incorporation).
  const current = fiscalYearOf(new Date(), p.fiscal_year_end);
  const options: CloseOption[] = [1, 2, 3]
    .map((n) => current - n)
    .map((fy) => {
      const r = fiscalRange(fy, p.fiscal_year_end);
      return { fy, label: `FY${fy}`, end: r.end, lockBefore: format(addDays(parseISO(r.end), 1), 'yyyy-MM-dd') };
    })
    .filter((o) => !p.incorporated_on || o.end >= p.incorporated_on);

  return (
    <SettingsPage
      title="Tax"
      action={saveProfile}
      after={
        <>
          <TaxRates rates={allRates} defaultCode={p.default_tax_code} />
          <CloseBooks options={options} lockedBefore={p.lock_books_before} />
        </>
      }
    >
      <Section title="GST/HST" footer="Annual filers with revenue under $1.5M usually file once a year, due three months after year-end.">
        <SelectField
          name="gst_filing_period"
          label="Filing period"
          defaultValue={p.gst_filing_period}
          options={[{ value: 'annual', label: 'Annual' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'monthly', label: 'Monthly' }]}
        />
        <TextField name="gst_registered_on" label="Registered on" type="date" defaultValue={p.gst_registered_on ?? ''} />
        <Toggle
          name="gst_quick_method"
          label="Quick method"
          hint="Remit a fixed percentage of sales instead of tracking input tax credits. Only if you elected it with CRA."
          defaultChecked={p.gst_quick_method}
        />
      </Section>

      <Section title="Fiscal year">
        <TextField name="fiscal_year_end" label="Year-end" defaultValue={p.fiscal_year_end} placeholder="MM-DD" inputMode="numeric" maxLength={5} hint="Month and day, e.g. 09-30 for September 30." />
        <Note tone="warn">Confirm with your accountant before changing — it changes how every report groups your books.</Note>
      </Section>

      <Section title="Defaults" footer="The default tax code is pre-selected on new invoice lines and products. Expenses over the receipt threshold are flagged until a receipt is attached (0 = always).">
        <SelectField
          name="default_tax_code"
          label="Default tax code"
          defaultValue={p.default_tax_code}
          options={allRates.filter((r) => r.active).map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))}
        />
        <TextField name="receipt_required_over" label="Receipt required over" defaultValue={String(Number(p.receipt_required_over))} inputMode="decimal" align="right" trailing="CAD" />
      </Section>
    </SettingsPage>
  );
}
