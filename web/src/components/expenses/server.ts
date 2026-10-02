import 'server-only';
import { format, subDays, parseISO } from 'date-fns';
import { db, must } from '@/lib/db';
import { num } from '@/lib/format';
import { detectPreset, type Nature, type TaxPreset } from './math';

export type FxQuote = { rate: number; rateDate: string; source: 'bank_of_canada' | 'stored' | 'fallback' };

/**
 * Bank of Canada daily rate to CAD for `date` (or the closest earlier business
 * day, up to 7 days back for weekends/holidays). Cached in `fx_rates`.
 */
export async function fxRateFor(currency: string, date: string): Promise<FxQuote> {
  if (currency === 'CAD') return { rate: 1, rateDate: date, source: 'stored' };
  const supabase = await db();
  const from = format(subDays(parseISO(date), 7), 'yyyy-MM-dd');
  const stored = must(await supabase.from('fx_rates').select('rate_date, rate_to_cad').eq('currency', currency)
    .gte('rate_date', from).lte('rate_date', date).order('rate_date', { ascending: false }).limit(1).maybeSingle());
  if (stored && stored.rate_date === date) return { rate: num(stored.rate_to_cad), rateDate: stored.rate_date, source: 'stored' };

  try {
    const series = `FX${currency}CAD`;
    const res = await fetch(`https://www.bankofcanada.ca/valet/observations/${series}/json?start_date=${from}&end_date=${date}`, {
      signal: AbortSignal.timeout(6000), cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { observations?: { d: string; [k: string]: { v: string } | string }[] };
      const obs = (json.observations ?? [])
        .map((o) => ({ d: o.d, v: Number((o[series] as { v: string } | undefined)?.v) }))
        .filter((o) => o.v > 0);
      if (obs.length) {
        await supabase.from('fx_rates').upsert(obs.map((o) => ({ currency, rate_date: o.d, rate_to_cad: o.v, source: 'bank_of_canada' })), { onConflict: 'currency,rate_date' });
        const best = obs.sort((a, b) => b.d.localeCompare(a.d))[0]!;
        return { rate: best.v, rateDate: best.d, source: 'bank_of_canada' };
      }
    }
  } catch {
    // offline or BoC unavailable — fall through to what we have
  }
  if (stored) return { rate: num(stored.rate_to_cad), rateDate: stored.rate_date, source: 'stored' };
  const last = must(await supabase.from('fx_rates').select('rate_date, rate_to_cad').eq('currency', currency).lte('rate_date', date)
    .order('rate_date', { ascending: false }).limit(1).maybeSingle());
  return last ? { rate: num(last.rate_to_cad), rateDate: last.rate_date, source: 'stored' } : { rate: 1.4, rateDate: date, source: 'fallback' };
}

export type VendorMemory = {
  vendor: string; category_id: string | null; nature: Nature; business_pct: number; paid_from_account_id: string;
  spent_by: string; project_id: string | null; currency: string; taxPreset: TaxPreset; description: string | null; tags: string[];
};

export type FormOptions = Awaited<ReturnType<typeof expenseFormOptions>>;

/** Everything the expense form needs: pickers, vendor memory and smart defaults. */
export async function expenseFormOptions(memberId: string) {
  const supabase = await db();
  const [cats, accounts, members, projects, history] = await Promise.all([
    supabase.from('categories').select('id, name, icon, deductible_pct, is_capital, cca_class, gifi_code, sort').eq('kind', 'expense').eq('archived', false).order('sort'),
    supabase.from('money_accounts').select('id, name, kind, is_business, owner_member_id, currency, last4').eq('archived', false).order('kind'),
    supabase.from('members').select('id, full_name, initials, color').eq('active', true).order('full_name'),
    supabase.from('projects').select('id, name, status').order('name'),
    supabase.from('expenses').select('vendor, category_id, nature, business_pct, paid_from_account_id, spent_by, project_id, currency, total, gst_hst, pst, description, tags, spent_on')
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(1500),
  ]);
  const rows = must(history);

  const vendors: VendorMemory[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.vendor.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    vendors.push({
      vendor: r.vendor, category_id: r.category_id, nature: r.nature, business_pct: num(r.business_pct), paid_from_account_id: r.paid_from_account_id,
      spent_by: r.spent_by, project_id: r.project_id, currency: r.currency, taxPreset: detectPreset(num(r.total), num(r.gst_hst), num(r.pst)),
      description: r.description, tags: r.tags,
    });
  }

  // Recent categories for this member, most recent first.
  const recentCategories: string[] = [];
  for (const r of rows) {
    if (r.spent_by !== memberId || !r.category_id || recentCategories.includes(r.category_id)) continue;
    recentCategories.push(r.category_id);
    if (recentCategories.length >= 6) break;
  }

  // Each member's usual way to pay: most used account in their last 60 manual-ish expenses.
  const usualAccount: Record<string, string> = {};
  for (const m of must(members)) {
    const counts = new Map<string, number>();
    rows.filter((r) => r.spent_by === m.id).slice(0, 60).forEach((r) => counts.set(r.paid_from_account_id, (counts.get(r.paid_from_account_id) ?? 0) + 1));
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) usualAccount[m.id] = best[0];
  }

  const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();
  return {
    categories: must(cats).map((c) => ({ ...c, deductible_pct: num(c.deductible_pct) })),
    accounts: must(accounts),
    members: must(members),
    projects: must(projects),
    vendors,
    recentCategories,
    usualAccount,
    tags,
  };
}
