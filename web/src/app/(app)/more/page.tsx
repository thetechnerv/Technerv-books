import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { NAV } from '@/components/shell/nav';
import { db } from '@/lib/db';

export const metadata = { title: 'More' };

/** Phone-only index of every section that isn't in the tab bar. */
export default async function More() {
  const supabase = await db();
  const { count } = await supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('status', 'unreviewed');
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !['/', '/invoices', '/expenses'].includes(i.href)) })).filter((g) => g.items.length);
  return (
    <Page title="More">
      {groups.map((g, i) => (
        <Section key={i} title={g.label ?? undefined} inset={58}>
          {g.items.map((it) => (
            <Row
              key={it.href}
              href={it.href}
              icon={<IconTile color={it.color}><it.icon strokeWidth={2.2} /></IconTile>}
              title={it.label}
              value={it.badge === 'review' && count ? <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1.5 text-caption font-bold text-white">{count}</span> : undefined}
            />
          ))}
        </Section>
      ))}
    </Page>
  );
}
