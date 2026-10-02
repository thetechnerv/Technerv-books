import 'server-only';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';
import { isoToday } from '@/lib/format';
import type { EditorData } from './editor';

/** Reference data the editor needs: clients, projects, catalogue, tax rates, defaults. */
export async function editorData(): Promise<EditorData> {
  const supabase = await db();
  const [profile, clients, projects, items, rates] = await Promise.all([
    businessProfile(),
    supabase.from('clients').select('id, display_name, company_name, province, country, currency, terms_days, default_tax_rate_id, email, archived').order('display_name'),
    supabase.from('projects').select('id, name, client_id, status').order('name'),
    supabase.from('items').select('id, name, description, unit, unit_price, tax_rate_id').eq('archived', false).order('name'),
    supabase.from('tax_rates').select('id, code, name, rate, kind, province, active').order('rate'),
  ]);
  return {
    clients: must(clients),
    projects: must(projects),
    items: must(items).map((i) => ({ ...i, unit_price: Number(i.unit_price) })),
    rates: must(rates),
    defaults: {
      termsDays: profile.default_terms_days,
      estimateValidDays: profile.estimate_valid_days,
      lockBefore: profile.lock_books_before,
      today: isoToday(),
      gstNumber: profile.gst_number,
    },
  };
}
