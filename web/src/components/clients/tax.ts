/**
 * Place-of-supply rules for Tech Nerv's services (custom AI builds, consulting,
 * support retainers). For services, the place of supply is generally the
 * province of the client's business address; services to a non-resident
 * business outside Canada are zero-rated exports.
 *
 * Pure module: safe to import from client and server components.
 */

export const PROVINCES: { code: string; name: string }[] = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

export const US_STATES: { code: string; name: string }[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code: code!, name: name! }));

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'IE', name: 'Ireland' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
];

export const countryName = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? '';
export const provinceName = (code: string | null | undefined, country = 'CA') =>
  (country === 'US' ? US_STATES : PROVINCES).find((p) => p.code === code)?.name ?? code ?? '';

export type TaxCode = 'GST' | 'HST-ON' | 'HST-NS' | 'HST-NB' | 'HST-NL' | 'HST-PE' | 'ZERO';

export type TaxTreatment = {
  code: TaxCode;
  /** "GST 5%", "HST 13%", "Zero-rated export" */
  label: string;
  /** Why: "Place of supply: Ontario" */
  reason: string;
  /** Caveat to confirm with the accountant, when there is one. */
  note?: string;
  rate: number;
};

const HST: Record<string, { code: TaxCode; rate: number }> = {
  ON: { code: 'HST-ON', rate: 0.13 },
  NS: { code: 'HST-NS', rate: 0.14 },
  NB: { code: 'HST-NB', rate: 0.15 },
  NL: { code: 'HST-NL', rate: 0.15 },
  PE: { code: 'HST-PE', rate: 0.15 },
};

const PROVINCIAL_NOTE: Record<string, string> = {
  BC: 'BC PST generally doesn’t apply to custom software and consulting services. Confirm with your accountant.',
  QC: 'Quebec QST isn’t charged unless Tech Nerv registers for QST. Confirm with your accountant.',
  SK: 'Saskatchewan PST isn’t charged by an out-of-province supplier of these services. Confirm with your accountant.',
  MB: 'Manitoba RST isn’t charged by an out-of-province supplier of these services. Confirm with your accountant.',
};

/** Derive the default sales tax from where the client is. */
export function taxTreatment(country: string | null | undefined, province: string | null | undefined): TaxTreatment {
  const c = (country || 'CA').toUpperCase();
  const p = (province || '').toUpperCase();
  if (c !== 'CA') {
    return {
      code: 'ZERO', rate: 0, label: 'Zero-rated export',
      reason: `Outside Canada${c ? ` · ${countryName(c)}` : ''}`,
      note: 'Services to a business outside Canada are zero-rated. Keep proof the client isn’t in Canada.',
    };
  }
  const hst = HST[p];
  if (hst) {
    return { ...hst, label: `HST ${Math.round(hst.rate * 100)}%`, reason: `Place of supply: ${provinceName(p)}`, note: 'HST replaces GST and provincial sales tax.' };
  }
  return {
    code: 'GST', rate: 0.05, label: 'GST 5%',
    reason: p ? `Place of supply: ${provinceName(p)}` : 'Canada · province not set',
    note: PROVINCIAL_NOTE[p],
  };
}

/** Short chip label for any stored tax rate code. */
export function taxLabel(code: string | null | undefined) {
  switch (code) {
    case 'GST': return 'GST 5%';
    case 'HST-ON': return 'HST 13%';
    case 'HST-NS': return 'HST 14%';
    case 'HST-NB': case 'HST-NL': case 'HST-PE': return 'HST 15%';
    case 'ZERO': return 'Zero-rated';
    case 'EXEMPT': return 'Exempt';
    case 'PST-BC': return 'BC PST 7%';
    default: return code ?? '—';
  }
}

export function termsLabel(days: number | null | undefined, fallback?: number) {
  const d = days ?? fallback;
  if (d === null || d === undefined) return 'Default terms';
  if (d === 0) return 'Due on receipt';
  return `Net ${d}`;
}
