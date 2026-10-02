import { Page } from '@/components/ui/page';
import { ExpenseForm, type ExpenseFormValues } from '@/components/expenses/expense-form';
import { expenseFormOptions } from '@/components/expenses/server';
import { db } from '@/lib/db';
import { currentMember, businessProfile } from '@/lib/session';
import { isoToday, num, date } from '@/lib/format';

export const metadata = { title: 'New expense' };

export default async function NewExpense({ searchParams }: { searchParams: Promise<{ scan?: string; from?: string }> }) {
  const sp = await searchParams;
  const [me, profile, supabase] = await Promise.all([currentMember(), businessProfile(), db()]);
  const options = await expenseFormOptions(me.id);
  const today = isoToday();

  let initial: Partial<ExpenseFormValues> | undefined;
  let duplicatedFrom: string | null = null;
  if (sp.from && /^[0-9a-f-]{36}$/i.test(sp.from)) {
    const { data: src } = await supabase.from('expenses').select('*').eq('id', sp.from).maybeSingle();
    if (src) {
      duplicatedFrom = `${src.vendor} on ${date(src.spent_on)}`;
      initial = {
        spent_on: today, vendor: src.vendor, description: src.description ?? '', category_id: src.category_id, project_id: src.project_id,
        spent_by: src.spent_by, paid_from_account_id: src.paid_from_account_id, nature: src.nature, business_pct: num(src.business_pct),
        currency: src.currency === 'USD' ? 'USD' : 'CAD', total: num(src.total), gst_hst: num(src.gst_hst), pst: num(src.pst),
        billable: src.billable, tags: src.tags, notes: src.notes ?? '',
      };
    }
  }

  return (
    <Page title={sp.scan ? 'Snap receipt' : 'New expense'} back={{ href: '/expenses', label: 'Expenses' }}>
      <ExpenseForm
        options={options}
        meId={me.id}
        today={today}
        lockBefore={profile.lock_books_before}
        mode="create"
        initial={initial}
        scan={sp.scan === '1'}
        duplicatedFrom={duplicatedFrom}
      />
    </Page>
  );
}
