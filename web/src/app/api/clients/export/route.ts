import { NextResponse, type NextRequest } from 'next/server';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { currentMember, businessProfile } from '@/lib/session';
import { loadClientSummaries } from '@/components/clients/data';
import { taxLabel } from '@/components/clients/tax';

/**
 * GET /api/clients/export[?archived=1]
 * Every client with contact details, tax setup and receivables, as CSV.
 * Archived clients are included unless ?archived=0.
 */
export async function GET(req: NextRequest) {
  await currentMember();
  const profile = await businessProfile();
  const { clients, fy } = await loadClientSummaries(profile.fiscal_year_end);
  const includeArchived = req.nextUrl.searchParams.get('archived') !== '0';
  const rows = clients
    .filter((c) => includeArchived || !c.archived)
    .map((c) => ({
      'Display name': c.display_name,
      'Legal name': c.company_name ?? '',
      Contact: c.contact_name ?? '',
      Email: c.email ?? '',
      'CC emails': (c.cc_emails ?? []).join('; '),
      Phone: c.phone ?? '',
      'Address line 1': c.address_line1 ?? '',
      'Address line 2': c.address_line2 ?? '',
      City: c.city ?? '',
      'Province/state': c.province ?? '',
      'Postal code': c.postal_code ?? '',
      Country: c.country,
      Currency: c.currency,
      'Sales tax': c.taxCode ? `${taxLabel(c.taxCode)} (${c.taxCode})` : '',
      'Payment terms (days)': c.terms_days ?? profile.default_terms_days,
      Status: c.archived ? 'Archived' : 'Active',
      'Open invoices': c.stats.openCount,
      Outstanding: c.stats.open.toFixed(2),
      Overdue: c.stats.overdue.toFixed(2),
      [`Billed ${fy.label}`]: c.stats.billedFy.toFixed(2),
      'Lifetime billed': c.stats.billed.toFixed(2),
      'Last invoice': c.stats.lastInvoiceOn ?? '',
      'Last payment': c.stats.lastPaymentOn ?? '',
      'Avg days to pay': c.stats.avgDaysToPay ?? '',
      Notes: c.notes ?? '',
      'Client since': c.created_at.slice(0, 10),
    }));
  // BOM so Excel opens UTF-8 (accents, en dashes) correctly.
  const csv = '﻿' + Papa.unparse(rows, { newline: '\r\n' });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tech-nerv-clients-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
