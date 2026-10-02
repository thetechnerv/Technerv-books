/**
 * Settings validation shared by the client (inline errors) and the server
 * actions (the source of truth). Pure functions only — safe in both places.
 */

export const PROVINCES = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'], ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'],
  ['QC', 'Quebec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
] as const;

export const TIMEZONES = [
  ['America/Vancouver', 'Pacific (Vancouver)'],
  ['America/Edmonton', 'Mountain (Edmonton)'],
  ['America/Regina', 'Central, no DST (Regina)'],
  ['America/Winnipeg', 'Central (Winnipeg)'],
  ['America/Toronto', 'Eastern (Toronto)'],
  ['America/Halifax', 'Atlantic (Halifax)'],
  ['America/St_Johns', 'Newfoundland (St. John’s)'],
] as const;

export const THEMES = ['studio', 'midnight', 'minimal'] as const;
export type InvoiceTheme = (typeof THEMES)[number];

export const ACCENTS = [
  { value: '#03DDAA', label: 'Mint' },
  { value: '#05A38C', label: 'Teal' },
  { value: '#0680A2', label: 'Ocean' },
  { value: '#0C1113', label: 'Ink' },
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEX = /^#[0-9A-F]{6}$/;

export const isEmail = (v: string) => EMAIL.test(v);
export const isHex = (v: string) => HEX.test(v.toUpperCase());

export function validMonthDay(v: string) {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]), day = Number(m[2]);
  if (month < 1 || month > 12) return false;
  const max = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day >= 1 && day <= max;
}

export function validIsoDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

type Kind = 'text' | 'int' | 'num' | 'bool' | 'date' | 'enum';
type Spec = {
  kind: Kind;
  label: string;
  /** Text column is NOT NULL: blank saves as '' instead of null. */
  notNull?: boolean;
  required?: boolean;
  max?: number;
  min?: number;
  options?: readonly string[];
  normalize?: (v: string) => string;
  check?: (v: string, all: (name: string) => string | null) => string | null;
};

/** Every business_profile column the settings screens may write. */
export const PROFILE_FIELDS: Record<string, Spec> = {
  // Company
  legal_name: { kind: 'text', label: 'Legal name', required: true, notNull: true, max: 120 },
  operating_name: { kind: 'text', label: 'Operating name', max: 120 },
  business_number: {
    kind: 'text', label: 'Business number',
    normalize: (v) => v.replace(/[\s-]/g, ''),
    check: (v) => (/^\d{9}$/.test(v) ? null : 'A business number is 9 digits.'),
  },
  gst_number: {
    kind: 'text', label: 'GST/HST number',
    normalize: normalizeGst,
    check: (v, all) => {
      if (!/^\d{9} RT\d{4}$/.test(v)) return 'Use the format 123456789 RT0001.';
      const bn = all('business_number')?.replace(/[\s-]/g, '');
      if (bn && /^\d{9}$/.test(bn) && !v.startsWith(bn)) return 'Should start with your 9-digit business number.';
      return null;
    },
  },
  bc_incorporation_number: {
    kind: 'text', label: 'BC incorporation number',
    normalize: (v) => v.replace(/\s/g, '').toUpperCase(),
    check: (v) => (/^(BC|A|C|S|FM)\d{7}$/.test(v) ? null : 'BC incorporation numbers look like BC1234567.'),
  },
  incorporated_on: { kind: 'date', label: 'Incorporation date', check: notFuture },
  address_line1: { kind: 'text', label: 'Address', max: 120 },
  address_line2: { kind: 'text', label: 'Address line 2', max: 120 },
  city: { kind: 'text', label: 'City', max: 80 },
  province: { kind: 'enum', label: 'Province', options: PROVINCES.map((p) => p[0]), required: true },
  postal_code: {
    kind: 'text', label: 'Postal code',
    normalize: (v) => {
      const c = v.replace(/\s/g, '').toUpperCase();
      return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : v.trim().toUpperCase();
    },
    check: (v) => (/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(v) ? null : 'Canadian postal codes look like V2C 1X8.'),
  },
  email: { kind: 'text', label: 'Email', normalize: (v) => v.trim().toLowerCase(), check: (v) => (isEmail(v) ? null : 'Enter a valid email address.') },
  phone: {
    kind: 'text', label: 'Phone', max: 30,
    check: (v) => { const d = v.replace(/\D/g, ''); return d.length >= 10 && d.length <= 15 ? null : 'Enter a 10-digit phone number.'; },
  },
  website: {
    kind: 'text', label: 'Website', max: 120,
    normalize: (v) => v.trim().replace(/\/+$/, ''),
    check: (v) => (/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v) ? null : 'Enter a web address like technerv.com.'),
  },
  timezone: { kind: 'enum', label: 'Time zone', options: TIMEZONES.map((t) => t[0]), required: true },

  // Branding & invoices
  invoice_theme: { kind: 'enum', label: 'Invoice theme', options: THEMES, required: true },
  invoice_accent: {
    kind: 'text', label: 'Accent colour', required: true, notNull: true,
    normalize: (v) => { const t = v.trim().toUpperCase(); return t.startsWith('#') ? t : '#' + t; },
    check: (v) => (HEX.test(v) ? null : 'Use a hex colour like #03DDAA.'),
  },
  invoice_show_logo: { kind: 'bool', label: 'Show logo' },
  invoice_thank_you: { kind: 'text', label: 'Thank-you line', max: 200 },
  invoice_footer: { kind: 'text', label: 'Footer', max: 300 },
  payment_instructions: { kind: 'text', label: 'Payment instructions', max: 1000 },
  etransfer_email: { kind: 'text', label: 'e-Transfer email', normalize: (v) => v.trim().toLowerCase(), check: (v) => (isEmail(v) ? null : 'Enter a valid email address.') },
  bank_details: { kind: 'text', label: 'Bank details', max: 400 },
  invoice_prefix: { kind: 'text', label: 'Invoice prefix', notNull: true, max: 12, check: prefixCheck },
  next_invoice_seq: { kind: 'int', label: 'Next invoice number', required: true, min: 1, max: 99_999_999 },
  estimate_prefix: { kind: 'text', label: 'Estimate prefix', notNull: true, max: 12, check: prefixCheck },
  next_estimate_seq: { kind: 'int', label: 'Next estimate number', required: true, min: 1, max: 99_999_999 },
  default_terms_days: { kind: 'int', label: 'Payment terms', required: true, min: 0, max: 365 },
  estimate_valid_days: { kind: 'int', label: 'Estimate validity', required: true, min: 1, max: 365 },

  // Tax
  gst_filing_period: { kind: 'enum', label: 'Filing period', options: ['annual', 'quarterly', 'monthly'], required: true },
  fiscal_year_end: {
    kind: 'text', label: 'Fiscal year-end', required: true, notNull: true,
    check: (v) => (validMonthDay(v) ? null : 'Use MM-DD, for example 09-30.'),
  },
  gst_registered_on: { kind: 'date', label: 'GST registration date', check: notFuture },
  gst_quick_method: { kind: 'bool', label: 'Quick method' },
  default_tax_code: { kind: 'text', label: 'Default tax code', required: true, notNull: true, max: 20 },
  receipt_required_over: { kind: 'num', label: 'Receipt threshold', required: true, min: 0, max: 100_000 },

  // Mileage & owners
  mileage_rate: { kind: 'num', label: 'First 5,000 km', required: true, min: 0.01, max: 5 },
  mileage_rate_after_5000: { kind: 'num', label: 'After 5,000 km', required: true, min: 0.01, max: 5 },
  shareholder_loan_alert_days: { kind: 'int', label: 'Alert after', required: true, min: 1, max: 730 },
};

function normalizeGst(v: string) {
  const c = v.replace(/[\s-]/g, '').toUpperCase();
  const m = /^(\d{9})RT(\d{4})$/.exec(c);
  return m ? `${m[1]} RT${m[2]}` : v.trim().toUpperCase();
}

function prefixCheck(v: string) {
  return /^[A-Za-z0-9\-_/#.]*$/.test(v) ? null : 'Letters, numbers and - _ / # . only.';
}

function notFuture(v: string) {
  return v > new Date().toISOString().slice(0, 10) ? 'This date is in the future.' : null;
}

/** Validates one raw form value. Returns an error message or null. */
export function checkProfileField(name: string, raw: string, all: (name: string) => string | null = () => null): string | null {
  const spec = PROFILE_FIELDS[name];
  if (!spec) return null;
  const v = spec.normalize ? spec.normalize(raw) : raw.trim();
  if (spec.kind === 'bool') return null;
  if (!v) return spec.required ? `${spec.label} is required.` : null;
  switch (spec.kind) {
    case 'text':
      if (spec.max && v.length > spec.max) return `Keep it under ${spec.max} characters.`;
      break;
    case 'int':
    case 'num': {
      const n = Number(v.replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n)) return 'Enter a number.';
      if (spec.kind === 'int' && !Number.isInteger(n)) return 'Enter a whole number.';
      if (spec.min !== undefined && n < spec.min) return `Must be at least ${spec.min}.`;
      if (spec.max !== undefined && n > spec.max) return `Must be ${spec.max.toLocaleString('en-CA')} or less.`;
      break;
    }
    case 'date':
      if (!validIsoDate(v)) return 'Enter a valid date.';
      break;
    case 'enum':
      if (!spec.options?.includes(v)) return 'Pick one of the options.';
      break;
  }
  return spec.check ? spec.check(v, all) : null;
}

/**
 * Turns submitted form data into a typed business_profile patch. Only keys
 * present in the form *and* listed in PROFILE_FIELDS are written.
 */
export function parseProfile(entries: [string, string][]) {
  const map = new Map(entries);
  const all = (n: string) => map.get(n) ?? null;
  const patch: Record<string, string | number | boolean | null> = {};
  const errors: Record<string, string> = {};
  for (const [name, raw] of map) {
    const spec = PROFILE_FIELDS[name];
    if (!spec) continue;
    const err = checkProfileField(name, raw, all);
    if (err) { errors[name] = err; continue; }
    const v = spec.normalize ? spec.normalize(raw) : raw.trim();
    switch (spec.kind) {
      case 'bool': patch[name] = raw === 'on' || raw === 'true'; break;
      case 'int': patch[name] = v ? Math.round(Number(v.replace(/[$,\s]/g, ''))) : null; break;
      case 'num': patch[name] = v ? Number(v.replace(/[$,\s]/g, '')) : null; break;
      case 'date': patch[name] = v || null; break;
      default: patch[name] = v || (spec.notNull ? '' : null);
    }
  }
  return { patch, errors };
}

/** Common CRA GIFI codes for a small services corporation (see CRA guide RC4088). */
export const GIFI_HINTS: { code: string; label: string; kind: 'income' | 'expense' | 'asset' }[] = [
  { code: '8000', label: 'Trade sales of goods and services', kind: 'income' },
  { code: '8090', label: 'Investment revenue (interest)', kind: 'income' },
  { code: '8230', label: 'Other revenue', kind: 'income' },
  { code: '8520', label: 'Advertising and promotion', kind: 'expense' },
  { code: '8523', label: 'Meals and entertainment', kind: 'expense' },
  { code: '8690', label: 'Insurance', kind: 'expense' },
  { code: '8710', label: 'Interest and bank charges', kind: 'expense' },
  { code: '8760', label: 'Business taxes, licences and memberships', kind: 'expense' },
  { code: '8810', label: 'Office expenses', kind: 'expense' },
  { code: '8811', label: 'Office stationery and supplies', kind: 'expense' },
  { code: '8860', label: 'Professional fees', kind: 'expense' },
  { code: '8871', label: 'Management and administration fees', kind: 'expense' },
  { code: '8910', label: 'Rental', kind: 'expense' },
  { code: '9150', label: 'Computer-related expenses', kind: 'expense' },
  { code: '9200', label: 'Travel expenses', kind: 'expense' },
  { code: '9220', label: 'Utilities', kind: 'expense' },
  { code: '9225', label: 'Telephone and telecommunications', kind: 'expense' },
  { code: '9270', label: 'Other expenses', kind: 'expense' },
  { code: '9281', label: 'Vehicle expenses', kind: 'expense' },
  { code: '1774', label: 'Computer equipment / software (asset)', kind: 'asset' },
  { code: '1787', label: 'Furniture and fixtures (asset)', kind: 'asset' },
];

/** Capital cost allowance classes a tech consultancy is likely to use. */
export const CCA_CLASSES = [
  { value: '8', label: 'Class 8 · 20% · furniture, equipment' },
  { value: '10', label: 'Class 10 · 30% · vehicles' },
  { value: '10.1', label: 'Class 10.1 · 30% · passenger vehicles over the cost limit' },
  { value: '12', label: 'Class 12 · 100% · small tools, software' },
  { value: '46', label: 'Class 46 · 30% · data network equipment' },
  { value: '50', label: 'Class 50 · 55% · computers' },
  { value: '54', label: 'Class 54 · 30% · zero-emission vehicles' },
];

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
