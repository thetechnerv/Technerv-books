import { Page } from '@/components/ui/page';
import { MoneyAccounts } from '@/components/settings/money-accounts';
import { allMembers } from '@/lib/session';
import { db, must } from '@/lib/db';

export const metadata = { title: 'Accounts' };

export default async function AccountsSettings() {
  const [members, supabase] = await Promise.all([allMembers(), db()]);
  const accounts = must(await supabase.from('money_accounts').select('*').order('archived').order('kind').order('name'));
  const counts = new Map(await Promise.all(accounts.map(async (a) => {
    const { count } = await supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('account_id', a.id);
    return [a.id, count ?? 0] as const;
  })));
  return (
    <Page title="Accounts" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <MoneyAccounts
          accounts={accounts.map((a) => ({ ...a, txns: counts.get(a.id) ?? 0 }))}
          members={members.map((m) => ({ id: m.id, full_name: m.full_name }))}
        />
      </div>
    </Page>
  );
}
