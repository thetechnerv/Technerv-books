import { Page } from '@/components/ui/page';
import { Products } from '@/components/settings/products';
import { db, must } from '@/lib/db';
import { businessProfile } from '@/lib/session';

export const metadata = { title: 'Products & services' };

export default async function ProductsSettings() {
  const [supabase, profile] = await Promise.all([db(), businessProfile()]);
  const [items, rates, cats] = await Promise.all([
    supabase.from('items').select('*').order('archived').order('name'),
    supabase.from('tax_rates').select('id, code, name, rate, active').order('rate'),
    supabase.from('categories').select('id, name, archived').eq('kind', 'income').order('sort'),
  ]);
  return (
    <Page title="Products & services" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <Products items={must(items)} rates={must(rates)} categories={must(cats)} defaultTaxCode={profile.default_tax_code} />
      </div>
    </Page>
  );
}
