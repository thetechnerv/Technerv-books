import { Page } from '@/components/ui/page';
import { RecurringView, type ScheduleRow } from '@/components/invoices/recurring-view';
import { db, must } from '@/lib/db';
import { money, num } from '@/lib/format';

export const metadata = { title: 'Recurring invoices' };

export default async function RecurringPage() {
  const supabase = await db();
  const [schedules, clients, invoices] = await Promise.all([
    supabase.from('recurring_invoices').select('*, clients(display_name)').order('next_run_on'),
    supabase.from('clients').select('id, display_name').eq('archived', false).order('display_name'),
    supabase.from('invoices').select('id, number, title, total, currency, issue_date, client_id, recurring_id, status').eq('kind', 'invoice').neq('status', 'void').order('issue_date', { ascending: false }),
  ]);
  const invs = must(invoices);
  const rows: ScheduleRow[] = must(schedules).map((s) => {
    const own = invs.filter((i) => i.recurring_id === s.id);
    const tpl = invs.find((i) => i.id === s.template_invoice_id) ?? own[0] ?? invs.find((i) => i.client_id === s.client_id) ?? null;
    return {
      id: s.id, client_id: s.client_id, client_name: s.clients?.display_name ?? '', frequency: s.frequency, next_run_on: s.next_run_on, end_on: s.end_on, active: s.active,
      template: tpl ? { id: tpl.id, number: tpl.number, title: tpl.title, total: num(tpl.total), currency: tpl.currency, issue_date: tpl.issue_date } : null,
      generated: own.length,
      lastDraft: own.find((i) => i.status === 'draft') ?? null,
    };
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.next_run_on.localeCompare(b.next_run_on));

  const active = rows.filter((r) => r.active);
  const monthly = active.reduce((s, r) => {
    const t = r.template ? r.template.total * (r.template.currency === 'CAD' ? 1 : 1.4) : 0;
    const k = r.frequency === 'weekly' ? 52 / 12 : r.frequency === 'quarterly' ? 1 / 3 : r.frequency === 'yearly' ? 1 / 12 : 1;
    return s + t * k;
  }, 0);

  return (
    <Page
      title="Recurring"
      subtitle={active.length ? `${active.length} active · about ${money(monthly, 'CAD', { cents: false })}/month` : 'No active schedules'}
      back={{ href: '/invoices', label: 'Invoices' }}
    >
      <RecurringView
        rows={rows}
        clients={must(clients).map((c) => ({ id: c.id, name: c.display_name }))}
        templates={invs.slice(0, 300).map((i) => ({ id: i.id, client_id: i.client_id, label: `${i.number}${i.title ? ` · ${i.title}` : ''}` }))}
      />
    </Page>
  );
}
