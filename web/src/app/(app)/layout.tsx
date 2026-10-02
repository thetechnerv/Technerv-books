import { AppShell } from '@/components/shell/app-shell';
import { SearchPalette } from '@/components/shell/search-palette';
import { currentMember, businessProfile } from '@/lib/session';
import { db, devBypass } from '@/lib/db';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [member, profile, supabase] = await Promise.all([currentMember(), businessProfile(), db()]);
  const [review, overdue] = await Promise.all([
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed'),
    supabase.from('invoice_overview').select('id', { count: 'exact', head: true }).eq('is_overdue', true),
  ]);
  return (
    <AppShell
      member={member}
      company={profile.operating_name ?? profile.legal_name}
      counts={{ review: review.count ?? 0, overdue: overdue.count ?? 0 }}
      devSession={!!(await devBypass())}
    >
      {children}
      <SearchPalette />
    </AppShell>
  );
}
