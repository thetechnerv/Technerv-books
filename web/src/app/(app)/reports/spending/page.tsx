import { Wallet } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty';
import { ReportFrame } from '@/components/reports/report-frame';
import { HBarChart, ShareBar, SERIES } from '@/components/reports/hbar-chart';
import { spending } from '@/components/reports/data';
import { periodFromParams, referenceData } from '@/components/tax/books';
import { currentMember } from '@/lib/session';
import { money, plural } from '@/lib/format';

export const metadata = { title: 'Spending by owner & account' };

const KIND: Record<string, string> = { bank: 'Bank', credit_card: 'Credit card', personal: 'Personal money', cash: 'Cash', payment_processor: 'Processor' };

export default async function SpendingReport({ searchParams }: { searchParams: Promise<{ fy?: string; from?: string; to?: string }> }) {
  await currentMember();
  const { ctx, period } = await periodFromParams(await searchParams);
  const [r, ref] = await Promise.all([spending(period), referenceData()]);
  // Stable order (the account list) so each account keeps its colour across periods.
  const order = new Map(ref.accounts.map((a, i) => [a.id, i]));
  const accounts = [...r.accounts].sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return (
    <ReportFrame title="Spending" report="spending" period={period} years={ctx.years}>
      {!r.owners.length ? (
        <EmptyState icon={<Wallet />} title="No spending in this period" message="Pick another year or a custom range." />
      ) : (
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          <div>
            <Section title={`By owner · ${money(r.total)}`} footer="Everything each owner spent, split into the business share and the personal share (charged back to them).">
              <HBarChart
                caption="Spending by owner"
                series={[{ key: 'business', label: 'Business share', color: SERIES[0]! }, { key: 'personal', label: 'Personal share', color: SERIES[1]! }]}
                rows={r.owners.map((o) => ({ key: o.id, label: o.name, sublabel: plural(o.count, 'expense'), value: o.total, segments: { business: o.business, personal: o.personal } }))}
              />
            </Section>
            <Section inset={58}>
              {r.owners.map((o) => (
                <Row key={o.id} href="/balances" icon={<Avatar name={o.name} color={o.color} initials={o.initials} size={30} />} title={o.name}
                  subtitle={`Business ${money(o.business, 'CAD', { cents: false })} · personal ${money(o.personal, 'CAD', { cents: false })}`}
                  value={money(o.total)} detail={o.outOfPocket ? `${money(o.outOfPocket, 'CAD', { cents: false })} out of pocket` : undefined} />
              ))}
            </Section>
          </div>
          <div>
            <Section title="By payment account" footer="Where the money came from. Personal-money purchases are owed back to the owner.">
              <ShareBar caption="Spending by payment account" parts={accounts.map((a) => ({ key: a.id, label: a.name, value: a.total }))} />
            </Section>
            <Section>
              {accounts.map((a) => (
                <Row key={a.id} title={a.name} subtitle={`${KIND[a.kind] ?? a.kind} · ${plural(a.count, 'expense')}`} value={money(a.total)} detail={a.business !== a.total ? `Business ${money(a.business, 'CAD', { cents: false })}` : undefined} />
              ))}
            </Section>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}
