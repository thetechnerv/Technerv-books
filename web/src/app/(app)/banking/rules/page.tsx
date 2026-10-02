import { Page } from '@/components/ui/page';
import { RulesManager, type RuleRow } from '@/components/banking/rules-manager';
import { db, must } from '@/lib/db';
import { reviewLookups } from '../_lib/data';

export const metadata = { title: 'Rules' };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ new?: string; q?: string }> }) {
  const [sp, supabase] = await Promise.all([searchParams, db()]);
  const [rules, lookups, open] = await Promise.all([
    supabase.from('rules').select('*, categories(name)').order('match_text'),
    reviewLookups(supabase),
    supabase.from('bank_transactions').select('rule_id').eq('status', 'unreviewed').not('rule_id', 'is', null),
  ]);
  const waiting = must(open);
  const rows: RuleRow[] = must(rules).map((r) => ({
    id: r.id, matchText: r.match_text, vendor: r.vendor_rename, categoryId: r.category_id, categoryName: (r.categories as { name: string } | null)?.name ?? null,
    nature: r.nature, priority: r.priority, timesApplied: r.times_applied, waiting: waiting.filter((w) => w.rule_id === r.id).length,
  }));
  return (
    <Page title="Rules" subtitle="Auto-fill vendor, category and type from the bank description" back={{ href: '/banking', label: 'Banking' }}>
      <RulesManager rules={rows} categories={lookups.expenseCategories} startNew={sp.new === '1' ? (sp.q ?? '') : null} />
    </Page>
  );
}
