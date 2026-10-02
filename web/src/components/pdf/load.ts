import 'server-only';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { date, num } from '@/lib/format';
import type { Row } from '@/lib/types';
import { computeTotals, KIND_LABEL, type TaxRate } from '@/components/invoices/shared';
import { addressLines, isHexColor, PDF_THEMES, type PdfModel, type PdfTheme } from './model';

type Profile = Row<'business_profile'>;
type Line = Pick<Row<'invoice_lines'>, 'description' | 'detail' | 'quantity' | 'unit' | 'unit_price' | 'tax_rate_id' | 'sort'>;
type Client = Pick<Row<'clients'>, 'display_name' | 'company_name' | 'contact_name' | 'email' | 'address_line1' | 'address_line2' | 'city' | 'province' | 'postal_code' | 'country'>;

export type PdfOverrides = { theme?: string | null; accent?: string | null; logo?: boolean | null; /** Dev QA: repeat lines to test page breaks. */ long?: boolean };

async function loadLogo(profile: Profile): Promise<PdfModel['logo']> {
  if (!profile.logo_path) return null;
  const fmt = /\.jpe?g$/i.test(profile.logo_path) ? 'jpg' : /\.png$/i.test(profile.logo_path) ? 'png' : null;
  if (!fmt) return null; // SVG/WebP logos fall back to the built-in mark
  try {
    const supabase = await db();
    const { data } = await supabase.storage.from('accounts').download(profile.logo_path);
    return data ? { data: Buffer.from(await data.arrayBuffer()), format: fmt } : null;
  } catch {
    return null;
  }
}

function businessBlock(p: Profile): PdfModel['business'] {
  return {
    name: p.operating_name ?? p.legal_name,
    legalName: p.legal_name,
    addressLines: addressLines(p),
    gstNumber: p.gst_number,
    businessNumber: p.business_number,
    email: p.email,
    phone: p.phone,
    website: p.website,
  };
}

function settings(p: Profile, o: PdfOverrides = {}) {
  const theme = (PDF_THEMES as string[]).includes(o.theme ?? '') ? (o.theme as PdfTheme) : (PDF_THEMES as string[]).includes(p.invoice_theme) ? (p.invoice_theme as PdfTheme) : 'studio';
  const accent = isHexColor(o.accent) ? o.accent.toUpperCase() : isHexColor(p.invoice_accent) ? p.invoice_accent : '#03DDAA';
  return {
    theme, accent,
    showLogo: o.logo ?? p.invoice_show_logo,
    thankYou: p.invoice_thank_you,
    paymentInstructions: p.payment_instructions,
    etransferEmail: p.etransfer_email,
    bankDetails: p.bank_details,
    footer: p.invoice_footer,
  };
}

function build(args: {
  inv: Pick<Row<'invoices'>, 'kind' | 'number' | 'title' | 'status' | 'issue_date' | 'due_date' | 'currency' | 'po_number' | 'notes' | 'terms' | 'discount' | 'revision'> & { tax_total?: number | null; amount_paid?: number | null };
  lines: Line[]; client: Client; rates: TaxRate[]; profile: Profile; logo: PdfModel['logo'];
  projectName: string | null; reference: string | null; paidOn: string | null; revisionNote: string | null; overrides?: PdfOverrides;
}): PdfModel {
  const { inv, profile } = args;
  const lines = [...args.lines].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const totals = computeTotals(lines, args.rates, inv.discount, { gstNumber: profile.gst_number, taxTotal: inv.tax_total });
  const ratesById = new Map(args.rates.map((r) => [r.id, r]));
  const amountPaid = num(inv.amount_paid);
  return {
    kind: inv.kind, number: inv.number, title: inv.title, status: inv.status,
    issueDate: inv.issue_date, dueDate: inv.due_date, currency: inv.currency,
    poNumber: inv.po_number, projectName: args.projectName, notes: inv.notes, terms: inv.terms,
    revision: inv.revision, revisionNote: args.revisionNote, reference: args.reference,
    business: businessBlock(profile),
    client: {
      name: args.client.company_name ?? args.client.display_name,
      contact: args.client.contact_name,
      email: args.client.email,
      addressLines: addressLines(args.client),
    },
    lines: lines.map((l, i) => ({
      description: l.description, detail: l.detail ?? null, quantity: num(l.quantity), unit: l.unit,
      unitPrice: num(l.unit_price), amount: totals.amounts[i]!, taxCode: l.tax_rate_id ? ratesById.get(l.tax_rate_id)?.code ?? null : null,
    })),
    subtotal: totals.subtotal, discount: totals.discount,
    taxes: totals.taxes.map((t) => ({ label: t.label, amount: t.amount })),
    total: totals.total, amountPaid, balance: Math.round((totals.total - amountPaid) * 100) / 100, paidOn: args.paidOn,
    logo: args.logo,
    ...settings(profile, args.overrides),
  };
}

/** PDF model for a stored invoice / estimate / credit note, optionally an earlier revision. */
export async function invoicePdfModel(id: string, rev?: number | null): Promise<PdfModel | null> {
  const supabase = await db();
  const inv = must(await supabase.from('invoice_overview').select('*').eq('id', id).maybeSingle());
  if (!inv || !inv.id) return null;
  const [profile, rates, linesRes, clientRes, refRes] = await Promise.all([
    businessProfile(),
    supabase.from('tax_rates').select('id, code, name, rate, kind, province'),
    supabase.from('invoice_lines').select('description, detail, quantity, unit, unit_price, tax_rate_id, sort').eq('invoice_id', id).order('sort'),
    supabase.from('clients').select('*').eq('id', inv.client_id!).single(),
    inv.converted_from ? supabase.from('invoices').select('kind, number').eq('id', inv.converted_from).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const logo = await loadLogo(profile);
  const ref = refRes.data ? `${KIND_LABEL[refRes.data.kind]} ${refRes.data.number}` : null;

  if (rev && rev !== inv.revision) {
    const snap = must(await supabase.from('invoice_revisions').select('*').eq('invoice_id', id).eq('revision', rev).maybeSingle());
    if (!snap) return null;
    const s = snap.snapshot as { invoice: Row<'invoices'>; lines: Line[]; client: Client };
    return build({
      // An earlier revision is reproduced as it was issued: no payments, no stamps.
      inv: { ...s.invoice, revision: rev, status: s.invoice.status === 'draft' ? 'draft' : 'sent', amount_paid: 0, tax_total: null },
      lines: s.lines ?? [], client: s.client ?? must(clientRes), rates: must(rates), profile, logo,
      projectName: inv.project_name, reference: ref, paidOn: null,
      revisionNote: `Revision ${rev} of ${inv.revision}${snap.reason ? ` · ${snap.reason}` : ''} · ${date(snap.created_at)}`,
    });
  }

  return build({
    inv: { ...(inv as Row<'invoices'>) },
    lines: must(linesRes), client: must(clientRes), rates: must(rates), profile, logo,
    projectName: inv.project_name, reference: ref, paidOn: inv.status === 'paid' ? inv.last_payment_on : null, revisionNote: null,
  });
}

/** A realistic invoice for the Settings theme preview. */
export async function samplePdfModel(overrides: PdfOverrides): Promise<PdfModel> {
  const supabase = await db();
  const [profile, rates] = await Promise.all([businessProfile(), supabase.from('tax_rates').select('id, code, name, rate, kind, province')]);
  const all = must(rates);
  const gst = all.find((r) => r.code === 'GST')?.id ?? null;
  const logo = overrides.logo === false ? null : await loadLogo(profile);
  const prefix = profile.invoice_prefix;
  const model = build({
    inv: {
      kind: 'invoice', number: `${prefix}1042`, title: 'Voice AI Receptionist — launch', status: 'sent',
      issue_date: '2026-09-15', due_date: '2026-09-30', currency: 'CAD', po_number: 'PO-2291', notes: 'Launch completed Sept 12. Thanks for a smooth rollout.',
      terms: `Payment due within ${profile.default_terms_days} days. 1.5% monthly interest on overdue balances.`, discount: 0, revision: 1, amount_paid: 3000, tax_total: null,
    },
    lines: sampleLines(gst, !!overrides.long),
    client: {
      display_name: 'Riverbend Family Clinic', company_name: 'Riverbend Family Clinic Ltd.', contact_name: 'Dr. Priya Natarajan', email: 'admin@riverbendclinic.example',
      address_line1: '1180 Columbia Street West', address_line2: null, city: 'Kamloops', province: 'BC', postal_code: 'V2C 6R6', country: 'CA',
    },
    rates: all, profile, logo, projectName: 'Voice AI Receptionist', reference: null, paidOn: null, revisionNote: null, overrides,
  });
  return model;
}

function sampleLines(gst: string | null, long: boolean): Line[] {
  const base: Line[] = [
      { sort: 0, description: 'Voice AI Receptionist — build', detail: 'Design, build, telephony integration and launch', quantity: 1, unit: 'fixed', unit_price: 12000, tax_rate_id: gst },
      { sort: 1, description: 'Team training session', detail: 'Two-hour hands-on session for front-desk staff', quantity: 2, unit: 'session', unit_price: 400, tax_rate_id: gst },
      { sort: 2, description: 'Additional consulting', detail: 'After-hours call routing rules', quantity: 3.5, unit: 'hour', unit_price: 150, tax_rate_id: gst },
  ];
  if (!long) return base;
  return [...base, ...Array.from({ length: 34 }, (_, i) => ({ ...base[i % 3]!, sort: 3 + i, description: `Sprint ${i + 1} — ${base[i % 3]!.description}` }))];
}
