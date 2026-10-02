/**
 * Shared client/project input validation (used by the forms for inline errors
 * and again by the server actions). Pure module.
 */

export type ClientInput = {
  display_name: string;
  company_name: string;
  contact_name: string;
  email: string;
  cc_emails: string;          // comma / space separated in the form
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  currency: 'CAD' | 'USD';
  default_tax_rate_id: string; // '' = automatic (derived from place of supply)
  terms_days: string;          // '' = company default
  notes: string;
};

export type ProjectInput = {
  name: string;
  status: 'lead' | 'active' | 'paused' | 'done';
  budget: string;
  started_on: string;
  ended_on: string;
  notes: string;
};

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const CA_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const US_ZIP = /^\d{5}(-\d{4})?$/;

export const isEmail = (s: string) => EMAIL.test(s.trim());

export function splitEmails(s: string) {
  return s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
}

/** "v2c1t8" → "V2C 1T8"; US ZIPs untouched; others trimmed. */
export function normalizePostal(code: string, country: string) {
  const v = code.trim().toUpperCase();
  if (country === 'CA') {
    const compact = v.replace(/\s+/g, '');
    return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : v;
  }
  return v;
}

export function validateClient(v: ClientInput): FieldErrors<ClientInput> {
  const e: FieldErrors<ClientInput> = {};
  if (!v.display_name.trim()) e.display_name = 'Give the client a name.';
  else if (v.display_name.trim().length > 120) e.display_name = 'Keep the name under 120 characters.';
  if (v.email.trim() && !isEmail(v.email)) e.email = 'That doesn’t look like an email address.';
  const bad = splitEmails(v.cc_emails).filter((x) => !isEmail(x));
  if (bad.length) e.cc_emails = `Check ${bad.length === 1 ? 'this address' : 'these addresses'}: ${bad.join(', ')}`;
  const pc = v.postal_code.trim();
  if (pc && v.country === 'CA' && !CA_POSTAL.test(pc)) e.postal_code = 'Canadian postal codes look like V2C 1T8.';
  if (pc && v.country === 'US' && !US_ZIP.test(pc)) e.postal_code = 'ZIP codes look like 98101 or 98101-1234.';
  if (v.country === 'CA' && v.province && !/^[A-Z]{2}$/.test(v.province)) e.province = 'Choose a province.';
  if (!['CAD', 'USD'].includes(v.currency)) e.currency = 'Choose CAD or USD.';
  if (v.terms_days !== '' && !(Number.isInteger(Number(v.terms_days)) && Number(v.terms_days) >= 0 && Number(v.terms_days) <= 365)) {
    e.terms_days = 'Terms are a number of days (0–365).';
  }
  if (v.phone.trim() && v.phone.replace(/\D/g, '').length < 7) e.phone = 'That phone number looks too short.';
  return e;
}

export function validateProject(v: ProjectInput): FieldErrors<ProjectInput> {
  const e: FieldErrors<ProjectInput> = {};
  if (!v.name.trim()) e.name = 'Give the project a name.';
  if (!['lead', 'active', 'paused', 'done'].includes(v.status)) e.status = 'Choose a status.';
  if (v.budget.trim() && !(Number(v.budget.replace(/[,$\s]/g, '')) >= 0)) e.budget = 'Budget is an amount, like 12000.';
  if (v.started_on && v.ended_on && v.ended_on < v.started_on) e.ended_on = 'The end date is before the start date.';
  return e;
}

/** Loose comparison key for duplicate-name warnings. */
export function nameKey(s: string) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/\b(inc|ltd|llc|llp|corp|co|company|limited|incorporated)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
}
