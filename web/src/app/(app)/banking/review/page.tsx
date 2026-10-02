import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { IconButton } from '@/components/ui/button';
import { LinkSegmented } from '@/components/ui/segmented';
import { ReviewQueue } from '@/components/banking/review-queue';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { plural } from '@/lib/format';
import { feedAccounts, reviewItems, reviewLookups } from '../_lib/data';

export const metadata = { title: 'Review' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const [me, supabase, sp] = await Promise.all([currentMember(), db(), searchParams]);
  const accounts = await feedAccounts(supabase);
  const account = accounts.find((a) => a.id === sp.account)?.id ?? null;

  let q = supabase.from('bank_transactions').select('*').eq('status', 'unreviewed');
  if (account) q = q.eq('account_id', account);
  const txns = must(await q.order('posted_on').order('created_at').limit(300));
  const counts = must(await supabase.from('bank_transactions').select('account_id').eq('status', 'unreviewed'));
  const [items, lookups] = await Promise.all([reviewItems(txns, supabase), reviewLookups(supabase)]);
  const totalOpen = counts.length;

  const withItems = accounts.filter((a) => counts.some((c) => c.account_id === a.id));
  return (
    <Page
      title="Review"
      subtitle={totalOpen ? `${plural(totalOpen, 'transaction')} to sort` : 'All caught up'}
      back={{ href: '/banking', label: 'Banking' }}
      actions={<IconButton label="Rules" href="/banking/rules"><Settings2 className="size-[22px] lg:size-[18px]" /></IconButton>}
      toolbar={withItems.length > 1 || account ? (
        <LinkSegmented
          id="review-account"
          value={account ?? 'all'}
          options={[
            { value: 'all', label: 'All', href: '/banking/review', count: totalOpen },
            ...accounts.filter((a) => withItems.includes(a) || a.id === account).map((a) => ({
              value: a.id, label: a.name.replace(/^EQ Bank /, 'EQ '), href: `/banking/review?account=${a.id}`, count: counts.filter((c) => c.account_id === a.id).length,
            })),
          ]}
        />
      ) : undefined}
      wide
    >
      <ReviewQueue items={items} lookups={lookups} me={me.id} accountFilter={account} />
      <p className="mt-8 text-center text-footnote text-label-3 lg:text-left">
        Suggestions come from your existing records and <Link href="/banking/rules" className="font-medium text-accent-text">rules</Link>.
      </p>
    </Page>
  );
}
