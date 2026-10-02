import { Page } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { ImportWizard, type ImportAccount } from '@/components/banking/import-wizard';
import type { CsvMapping } from '@/components/banking/csv';
import { db, must } from '@/lib/db';
import { feedAccounts } from '../_lib/data';

export const metadata = { title: 'Import statement' };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const [sp, supabase] = await Promise.all([searchParams, db()]);
  const accounts = await feedAccounts(supabase);
  const lasts = must(await supabase.from('import_batches').select('account_id, date_to').order('date_to', { ascending: false }).limit(200));
  const list: ImportAccount[] = accounts.map((a) => ({
    id: a.id, name: a.name, kind: a.kind, currency: a.currency, color: a.color,
    mapping: (a.csv_mapping as unknown as CsvMapping | null) ?? null,
    lastTo: lasts.find((b) => b.account_id === a.id)?.date_to ?? null,
  }));
  const initial = list.find((a) => a.id === sp.account)?.id ?? null;
  return (
    <Page title="Import statement" subtitle="CSV or OFX from EQ Bank or your card" back={{ href: initial ? `/banking/${initial}` : '/banking', label: initial ? 'Account' : 'Banking' }}>
      {list.length ? <ImportWizard accounts={list} initialAccount={initial} /> : (
        <EmptyState title="No bank accounts yet" message="Add a bank account or card in Settings first." action={<Button href="/settings" variant="tinted">Open Settings</Button>} />
      )}
    </Page>
  );
}
