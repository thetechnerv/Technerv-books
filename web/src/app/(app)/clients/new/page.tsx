import { db, must } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { activeTaxRates } from '@/components/clients/data';
import { NewClientScreen } from '@/components/clients/client-sheets';

export const metadata = { title: 'New client' };

export default async function NewClientPage() {
  await currentMember();
  const [profile, supabase, rates] = await Promise.all([businessProfile(), db(), activeTaxRates()]);
  const names = must(await supabase.from('clients').select('id, display_name'));
  return (
    <NewClientScreen
      taxRates={rates.filter((r) => r.kind !== 'pst').map((r) => ({ id: r.id, code: r.code, name: r.name, rate: Number(r.rate) }))}
      others={names.map((n) => ({ id: n.id, name: n.display_name }))}
      defaultTerms={profile.default_terms_days}
    />
  );
}
