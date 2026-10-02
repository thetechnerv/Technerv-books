import type { InvoiceKind } from '@/lib/types';

export type PdfTheme = 'studio' | 'midnight' | 'minimal';
export const PDF_THEMES: PdfTheme[] = ['studio', 'midnight', 'minimal'];

export type PdfLine = {
  description: string;
  detail: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  amount: number;
  taxCode: string | null;
};

/** Everything the invoice PDF needs, already resolved — the document itself does no data access. */
export type PdfModel = {
  kind: InvoiceKind;
  number: string;
  title: string | null;
  status: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  poNumber: string | null;
  projectName: string | null;
  notes: string | null;
  terms: string | null;
  revision: number;
  /** Shown when rendering an earlier revision ("Revision 1 · issued Jul 14, 2025"). */
  revisionNote: string | null;
  /** "Estimate EST-1009" / "Invoice TN-1019" for converted documents and credit notes. */
  reference: string | null;
  business: {
    name: string;
    legalName: string;
    addressLines: string[];
    gstNumber: string | null;
    businessNumber: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
  };
  client: { name: string; contact: string | null; email: string | null; addressLines: string[] };
  lines: PdfLine[];
  subtotal: number;
  discount: number;
  taxes: { label: string; amount: number }[];
  total: number;
  amountPaid: number;
  balance: number;
  paidOn: string | null;
  theme: PdfTheme;
  accent: string;
  showLogo: boolean;
  logo: { data: Buffer; format: 'png' | 'jpg' } | null;
  thankYou: string | null;
  paymentInstructions: string | null;
  etransferEmail: string | null;
  bankDetails: string | null;
  footer: string | null;
};

export function addressLines(a: { address_line1?: string | null; address_line2?: string | null; city?: string | null; province?: string | null; postal_code?: string | null; country?: string | null }, homeCountry = 'CA') {
  const cityLine = [a.city, [a.province, a.postal_code].filter(Boolean).join('  ')].filter(Boolean).join(', ');
  const country = a.country && a.country !== homeCountry ? COUNTRY[a.country] ?? a.country : null;
  return [a.address_line1, a.address_line2, cityLine, country].filter((x): x is string => !!x && x.trim() !== '');
}
const COUNTRY: Record<string, string> = { US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia' };

export function isHexColor(v: string | null | undefined): v is string {
  return !!v && /^#[0-9a-f]{6}$/i.test(v);
}
