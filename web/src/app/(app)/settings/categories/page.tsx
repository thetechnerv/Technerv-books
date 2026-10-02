import { Page } from '@/components/ui/page';
import { Categories } from '@/components/settings/categories';
import { db, must } from '@/lib/db';

export const metadata = { title: 'Categories' };

export default async function CategoriesSettings({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const supabase = await db();
  const categories = must(await supabase.from('categories').select('*').order('sort').order('name'));
  return (
    <Page title="Categories" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <Categories categories={categories} initialKind={kind === 'income' ? 'income' : 'expense'} />
      </div>
    </Page>
  );
}
