import { cookies } from 'next/headers';
import {
  Building2, Palette, Calculator, Users, Landmark, Shapes, Package, Car, Scale, SunMoon, HardDrive, History, Smartphone,
} from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Avatar } from '@/components/ui/avatar';
import { db, devBypass } from '@/lib/db';
import { monthDayLabel, cap, cents } from '@/components/settings/format';
import { currentMember, businessProfile, allMembers } from '@/lib/session';
import { bytes, plural, relativeDay, date } from '@/lib/format';

export const metadata = { title: 'Settings' };

export default async function SettingsIndex() {
  const devBypassEmail = await devBypass();
  const [me, profile, members, supabase, store] = await Promise.all([currentMember(), businessProfile(), allMembers(), db(), cookies()]);
  const [accounts, categories, items, files, activity] = await Promise.all([
    supabase.from('money_accounts').select('id', { count: 'exact', head: true }).eq('archived', false),
    supabase.from('categories').select('id', { count: 'exact', head: true }).eq('archived', false),
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('archived', false),
    supabase.from('attachments').select('size_bytes').range(0, 9999),
    supabase.from('activity_log').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const used = (files.data ?? []).reduce((s, f) => s + Number(f.size_bytes ?? 0), 0);
  const theme = store.get('theme')?.value;
  const active = members.filter((m) => m.active);

  const groups: { title?: string; rows: { href: string; icon: typeof Building2; color: string; title: string; value?: string }[] }[] = [
    {
      title: 'Business',
      rows: [
        { href: '/settings/company', icon: Building2, color: '#0680A2', title: 'Company', value: profile.operating_name ?? profile.legal_name },
        { href: '/settings/branding', icon: Palette, color: '#D9467A', title: 'Branding & invoices', value: cap(profile.invoice_theme) },
        { href: '/settings/tax', icon: Calculator, color: '#E0352B', title: 'Tax', value: `${cap(profile.gst_filing_period)} · Year-end ${monthDayLabel(profile.fiscal_year_end)}` },
      ],
    },
    {
      title: 'Books',
      rows: [
        { href: '/settings/members', icon: Users, color: '#05A38C', title: 'Members', value: plural(active.length, 'owner') },
        { href: '/settings/accounts', icon: Landmark, color: '#0478A0', title: 'Accounts', value: String(accounts.count ?? 0) },
        { href: '/settings/categories', icon: Shapes, color: '#E8833A', title: 'Categories', value: String(categories.count ?? 0) },
        { href: '/settings/products', icon: Package, color: '#7C4DDB', title: 'Products & services', value: String(items.count ?? 0) },
      ],
    },
    {
      title: 'Rules',
      rows: [
        { href: '/settings/mileage', icon: Car, color: '#5E7CE2', title: 'Mileage', value: `${cents(profile.mileage_rate)} · ${cents(profile.mileage_rate_after_5000)} per km` },
        { href: '/settings/owners', icon: Scale, color: '#03BB90', title: 'Owners & loans', value: `Alert after ${profile.shareholder_loan_alert_days} days` },
      ],
    },
    {
      title: 'App',
      rows: [
        { href: '/settings/install', icon: Smartphone, color: '#03BB90', title: 'Install on your phone', value: 'Home Screen app' },
        { href: '/settings/appearance', icon: SunMoon, color: '#3B4B4E', title: 'Appearance', value: theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System' },
        { href: '/settings/data', icon: HardDrive, color: '#6B7B80', title: 'Data & storage', value: bytes(used) },
        { href: '/settings/activity', icon: History, color: '#E5A00D', title: 'Activity', value: activity.data ? relativeDay(activity.data.created_at) : undefined },
      ],
    },
  ];

  return (
    <Page title="Settings">
      <div className="lg:max-w-[720px]">
        <Section inset={76}>
          <Row
            href="/settings/account"
            icon={<Avatar name={me.full_name} color={me.color} initials={me.initials} size={48} />}
            title={<span className="text-headline font-semibold">{me.full_name}</span>}
            subtitle={devBypassEmail ? 'Dev session · sign-in skipped' : me.email}
            className="py-1"
          />
        </Section>

        {profile.lock_books_before && (
          <p className="-mt-4 mb-6 px-4 text-footnote text-label-2 lg:px-1">Books closed before {date(profile.lock_books_before)}.</p>
        )}

        {groups.map((g) => (
          <Section key={g.title} title={g.title} inset={58}>
            {g.rows.map((r) => (
              <Row key={r.href} href={r.href} icon={<IconTile color={r.color}><r.icon strokeWidth={2.2} /></IconTile>} title={r.title} value={r.value} />
            ))}
          </Section>
        ))}
        <p className="px-4 pb-2 text-center text-footnote text-label-3">{profile.legal_name} · Tech Nerv Accounts</p>
      </div>
    </Page>
  );
}
