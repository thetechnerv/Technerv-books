'use client';
import Link from 'next/link';
import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { AlertTriangle, Globe2, Landmark } from 'lucide-react';
import { Input, Select, TextArea } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Section, IconTile } from '@/components/ui/group';
import type { Row } from '@/lib/types';
import { COUNTRIES, PROVINCES, US_STATES, taxTreatment } from './tax';
import { nameKey, validateClient, type ClientInput, type FieldErrors } from './validate';
import { createClientAction, updateClientAction } from '@/app/(app)/clients/actions';

export type TaxRateOption = { id: string; code: string; name: string; rate: number };
export type ClientFormProps = {
  formId: string;
  client?: Row<'clients'> | null;
  taxRates: TaxRateOption[];
  others: { id: string; name: string }[];
  defaultTerms: number;
  onSaved: (id: string) => void;
  onPending?: (pending: boolean) => void;
  autoFocus?: boolean;
};

function initialInput(c: Row<'clients'> | null | undefined, taxRates: TaxRateOption[]): ClientInput {
  const country = c?.country ?? 'CA';
  const province = c?.province ?? (c ? '' : 'BC');
  const derivedId = taxRates.find((r) => r.code === taxTreatment(country, province).code)?.id;
  return {
    display_name: c?.display_name ?? '',
    company_name: c?.company_name ?? '',
    contact_name: c?.contact_name ?? '',
    email: c?.email ?? '',
    cc_emails: (c?.cc_emails ?? []).join(', '),
    phone: c?.phone ?? '',
    address_line1: c?.address_line1 ?? '',
    address_line2: c?.address_line2 ?? '',
    city: c?.city ?? '',
    province,
    postal_code: c?.postal_code ?? '',
    country,
    currency: (c?.currency as 'CAD' | 'USD') ?? 'CAD',
    // Stored rate equal to what the place of supply implies → treat as automatic.
    default_tax_rate_id: c?.default_tax_rate_id && c.default_tax_rate_id !== derivedId ? c.default_tax_rate_id : '',
    terms_days: c?.terms_days === null || c?.terms_days === undefined ? '' : String(c.terms_days),
    notes: c?.notes ?? '',
  };
}

const TERMS = [0, 7, 10, 15, 30, 45, 60];

export function ClientForm({ formId, client, taxRates, others, defaultTerms, onSaved, onPending, autoFocus }: ClientFormProps) {
  const [v, setV] = useState<ClientInput>(() => initialInput(client, taxRates));
  const [errors, setErrors] = useState<FieldErrors<ClientInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [touchedCurrency, setTouchedCurrency] = useState(!!client);
  const [, startTransition] = useTransition();

  const set = <K extends keyof ClientInput>(k: K, value: ClientInput[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const bind = (k: keyof ClientInput) => ({
    name: k, value: v[k] as string, error: errors[k],
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
  });

  const treatment = taxTreatment(v.country, v.province);
  const override = v.default_tax_rate_id ? taxRates.find((r) => r.id === v.default_tax_rate_id) : null;

  const duplicate = useMemo(() => {
    const k = nameKey(v.display_name);
    if (k.length < 3) return null;
    return others.find((o) => o.id !== client?.id && nameKey(o.name) === k) ?? null;
  }, [v.display_name, others, client?.id]);

  function changeCountry(country: string) {
    setV((s) => ({
      ...s, country,
      province: country === s.country ? s.province : '',
      currency: touchedCurrency ? s.currency : country === 'US' ? 'USD' : country === 'CA' ? 'CAD' : s.currency,
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateClient(v);
    setErrors(errs);
    setFormError(null);
    if (Object.values(errs).some(Boolean)) {
      document.getElementById(`${formId}-${Object.keys(errs).find((k) => errs[k as keyof ClientInput])}`)?.focus();
      return;
    }
    onPending?.(true);
    startTransition(async () => {
      const res = client ? await updateClientAction(client.id, v) : await createClientAction(v);
      onPending?.(false);
      if (!res.ok) { setFormError(res.error); return; }
      onSaved(client?.id ?? (res.data as { id: string }).id);
    });
  }

  const regionOptions = v.country === 'CA' ? PROVINCES : v.country === 'US' ? US_STATES : null;
  const fid = (k: string) => `${formId}-${k}`;

  return (
    <form id={formId} onSubmit={submit} noValidate className="pt-2">
      {formError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-group bg-red-soft px-4 py-3 text-subhead text-red">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {formError}
        </div>
      )}

      <Section
        title="Client"
        footer={duplicate ? (
          <span className="flex items-center gap-1.5 text-orange">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>You already have a client called <Link href={`/clients/${duplicate.id}`} className="font-semibold underline underline-offset-2">{duplicate.name}</Link>.</span>
          </span>
        ) : 'The display name is what you see in lists. The legal name goes on invoices.'}
      >
        <Input label="Name" id={fid('display_name')} placeholder="Riverbend Clinic" autoFocus={autoFocus} autoComplete="organization" {...bind('display_name')} />
        <Input label="Legal name" id={fid('company_name')} placeholder="Riverbend Family Clinic Ltd." autoComplete="off" {...bind('company_name')} />
      </Section>

      <Section title="Contact">
        <Input label="Contact" id={fid('contact_name')} placeholder="Full name" autoComplete="name" {...bind('contact_name')} />
        <Input label="Email" id={fid('email')} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="billing@client.com" {...bind('email')} />
        <Input label="CC" id={fid('cc_emails')} inputMode="email" autoCapitalize="none" placeholder="Other people who get invoices" hint={v.cc_emails ? 'Separate addresses with commas.' : undefined} {...bind('cc_emails')} />
        <Input label="Phone" id={fid('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="(250) 555-0100" {...bind('phone')} />
      </Section>

      <Section title="Address">
        <Input label="Street" id={fid('address_line1')} placeholder="Street address" autoComplete="address-line1" {...bind('address_line1')} />
        <Input label="Unit / suite" id={fid('address_line2')} placeholder="Optional" autoComplete="address-line2" {...bind('address_line2')} />
        <Input label="City" id={fid('city')} placeholder="City" autoComplete="address-level2" {...bind('city')} />
        {regionOptions ? (
          <Select
            label={v.country === 'US' ? 'State' : 'Province'}
            id={fid('province')}
            name="province"
            value={v.province}
            onChange={(e) => set('province', e.target.value)}
            placeholder={v.country === 'US' ? 'Choose state' : 'Choose province'}
            options={regionOptions.map((p) => ({ value: p.code, label: p.name }))}
          />
        ) : (
          <Input label="Region" id={fid('province')} placeholder="State / county (optional)" {...bind('province')} />
        )}
        <Input
          label={v.country === 'CA' ? 'Postal code' : v.country === 'US' ? 'ZIP code' : 'Postcode'}
          id={fid('postal_code')}
          autoCapitalize="characters"
          autoComplete="postal-code"
          inputMode={v.country === 'US' ? 'numeric' : 'text'}
          placeholder={v.country === 'CA' ? 'V2C 1T8' : v.country === 'US' ? '98101' : ''}
          {...bind('postal_code')}
        />
        <Select
          label="Country"
          id={fid('country')}
          name="country"
          value={v.country}
          onChange={(e) => changeCountry(e.target.value)}
          options={[...COUNTRIES, ...(COUNTRIES.some((c) => c.code === v.country) ? [] : [{ code: v.country, name: v.country }])].map((c) => ({ value: c.code, label: c.name }))}
        />
      </Section>

      <Section
        title="Tax & billing"
        inset={58}
        footer={override ? `Overridden. Automatic would be ${treatment.label}.` : treatment.note}
      >
        <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2.5 lg:px-3">
          <IconTile color={treatment.code === 'ZERO' ? 'var(--ocean)' : 'var(--teal)'}>{treatment.code === 'ZERO' ? <Globe2 strokeWidth={2.2} /> : <Landmark strokeWidth={2.2} />}</IconTile>
          <div className="min-w-0 flex-1">
            <div className="font-semibold" aria-live="polite">{override ? override.name : treatment.label}</div>
            <div className="text-footnote text-label-2">{override ? 'Set manually for this client' : treatment.reason}</div>
          </div>
        </div>
        <Select
          label="Sales tax"
          id={fid('default_tax_rate_id')}
          name="default_tax_rate_id"
          value={v.default_tax_rate_id}
          onChange={(e) => set('default_tax_rate_id', e.target.value)}
          options={[
            { value: '', label: `Automatic · ${treatment.label}` },
            ...taxRates.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
        <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
          <span className="w-[34%] max-w-[160px] shrink-0 lg:w-[140px]">Currency</span>
          <div className="flex flex-1 justify-end">
            <Segmented
              options={[{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }]}
              value={v.currency}
              onChange={(c) => { setTouchedCurrency(true); set('currency', c); }}
            />
          </div>
        </div>
        <Select
          label="Payment terms"
          id={fid('terms_days')}
          name="terms_days"
          value={v.terms_days}
          onChange={(e) => set('terms_days', e.target.value)}
          options={[
            { value: '', label: `Company default · Net ${defaultTerms}` },
            ...TERMS.map((d) => ({ value: String(d), label: d === 0 ? 'Due on receipt' : `Net ${d}` })),
            ...(v.terms_days && !TERMS.includes(Number(v.terms_days)) ? [{ value: v.terms_days, label: `Net ${v.terms_days}` }] : []),
          ]}
        />
      </Section>

      <Section title="Notes" footer="Only you and your partner see notes.">
        <TextArea name="notes" rows={3} placeholder="How they like to be billed, PO requirements, who approves…" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Section>

      {/* Lets Enter submit from any field on desktop */}
      <button type="submit" hidden aria-hidden tabIndex={-1} />
    </form>
  );
}
