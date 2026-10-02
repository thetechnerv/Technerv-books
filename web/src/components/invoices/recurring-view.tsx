'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, FilePlus2, MoreHorizontal, Pencil, Plus, Repeat, Trash2, Wand2 } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Button, IconButton } from '@/components/ui/button';
import { Switch, Input, Select } from '@/components/ui/fields';
import { Menu } from '@/components/ui/menu';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { cn } from '@/lib/cn';
import { date, daysUntil, isoToday, money, shortDate } from '@/lib/format';
import { ClientTile } from './client-tile';
import { FREQUENCIES, nextRun } from './shared';
import { createDueDrafts, deleteSchedule, runScheduleNow, saveSchedule, setScheduleActive } from '@/app/(app)/invoices/actions';

export type ScheduleRow = {
  id: string; client_id: string; client_name: string; frequency: string; next_run_on: string; end_on: string | null; active: boolean;
  template: { id: string; number: string; title: string | null; total: number; currency: string; issue_date: string } | null;
  generated: number; lastDraft: { id: string; number: string; status: string } | null;
};
export type TemplateOption = { id: string; client_id: string; label: string };

export function RecurringView({ rows, clients, templates }: { rows: ScheduleRow[]; clients: { id: string; name: string }[]; templates: TemplateOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Partial<ScheduleRow> | null>(null);
  const today = isoToday();
  const due = rows.filter((r) => r.active && r.next_run_on <= today && (!r.end_on || r.next_run_on <= r.end_on));
  const nextUp = rows.filter((r) => r.active).map((r) => r.next_run_on).sort()[0];

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, after?: (d: unknown) => void) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast({ title: r.error ?? 'Something went wrong', tone: 'error' });
    toast({ title: r.message ?? 'Done' });
    router.refresh();
    after?.(r.data);
  });

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-group bg-cell p-4 shadow-card sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><Wand2 className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{due.length ? `${due.length} draft${due.length === 1 ? '' : 's'} due` : 'Nothing due today'}</div>
          <div className="text-subhead text-label-2">
            {due.length ? 'Creates drafts from each client’s last invoice with this month’s name. You review and send them.' : nextUp ? `Next one is ${date(nextUp)} (${daysUntil(nextUp)} days). You can also create one early from its menu.` : 'Add a schedule to get started.'}
          </div>
        </div>
        <Button variant={due.length ? 'filled' : 'gray'} loading={pending} disabled={!due.length} onClick={() => run(createDueDrafts)} icon={<FilePlus2 className="size-4" />}>Create due drafts</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Repeat />} title="No recurring invoices" message="Open any invoice and choose “Make recurring…”, or add a schedule here." action={<Button variant="filled" onClick={() => setEditing({ frequency: 'monthly' })}>New schedule</Button>} />
      ) : (
        <Section title="Schedules" action={<button type="button" onClick={() => setEditing({ frequency: 'monthly' })} className="inline-flex items-center gap-1 text-footnote font-medium text-accent-text"><Plus className="size-3.5" />New</button>} inset={64}>
          {rows.map((r) => {
            const d = daysUntil(r.next_run_on);
            return (
              <div key={r.id} className={cn('flex items-center gap-3 px-4 py-2.5 lg:px-3', !r.active && 'opacity-60')}>
                <ClientTile id={r.client_id} name={r.client_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.client_name}</span>
                    <Badge tone="gray">{FREQUENCIES.find((f) => f.value === r.frequency)?.label ?? r.frequency}</Badge>
                  </div>
                  <div className="truncate text-subhead text-label-2">
                    {r.template ? <Link href={`/invoices/${r.template.id}`} className="hover:underline">{r.template.number}{r.template.title ? ` · ${r.template.title}` : ''}</Link> : 'Copies the client’s latest invoice'}
                  </div>
                  <div className={cn('flex items-center gap-1 text-footnote', r.active && d <= 0 ? 'font-medium text-orange' : 'text-label-3')}>
                    <CalendarClock className="size-3.5" />
                    {!r.active ? 'Paused' : d <= 0 ? `Due ${d === 0 ? 'today' : `since ${shortDate(r.next_run_on)}`}` : `Next ${shortDate(r.next_run_on)}`}
                    {r.end_on && ` · ends ${shortDate(r.end_on)}`}
                    {r.generated > 0 && ` · ${r.generated} so far`}
                  </div>
                </div>
                <span className="tabular hidden shrink-0 font-semibold sm:block">{r.template ? money(r.template.total, r.template.currency) : '—'}</span>
                <Switch on={r.active} label={r.active ? 'Pause schedule' : 'Resume schedule'} onChange={(v) => run(() => setScheduleActive(r.id, v))} />
                <Menu
                  trigger={<IconButton label="Schedule actions"><MoreHorizontal className="size-5" /></IconButton>}
                  items={[
                    { label: 'Create next draft now', icon: <FilePlus2 />, onSelect: () => run(() => runScheduleNow(r.id), (data) => { const x = data as { id: string } | undefined; if (x) router.push(`/invoices/${x.id}`); }) },
                    { label: 'Edit schedule', icon: <Pencil />, onSelect: () => setEditing(r) },
                    ...(r.lastDraft ? [{ label: `Open ${r.lastDraft.number}`, icon: <Repeat />, href: `/invoices/${r.lastDraft.id}` }] : []),
                    'separator',
                    {
                      label: 'Delete schedule…', icon: <Trash2 />, destructive: true,
                      onSelect: async () => { if (await confirm({ title: `Stop invoicing ${r.client_name} automatically?`, message: 'Invoices already created are kept.', confirmLabel: 'Delete', destructive: true })) run(() => deleteSchedule(r.id)); },
                    },
                  ]}
                />
              </div>
            );
          })}
        </Section>
      )}

      <ScheduleSheet value={editing} onClose={() => setEditing(null)} clients={clients} templates={templates} />
    </>
  );
}

function ScheduleSheet({ value, onClose, clients, templates }: { value: Partial<ScheduleRow> | null; onClose: () => void; clients: { id: string; name: string }[]; templates: TemplateOption[] }) {
  return (
    <Sheet open={!!value} onClose={onClose} title={value?.id ? 'Edit schedule' : 'New schedule'} size="sm" fit action={<SheetAction form="schedule-form">Save</SheetAction>}>
      {value && <ScheduleForm key={value.id ?? 'new'} value={value} onDone={onClose} clients={clients} templates={templates} />}
    </Sheet>
  );
}

function ScheduleForm({ value, onDone, clients, templates }: { value: Partial<ScheduleRow>; onDone: () => void; clients: { id: string; name: string }[]; templates: TemplateOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [client, setClient] = useState(value.client_id ?? '');
  const [freq, setFreq] = useState(value.frequency ?? 'monthly');
  const [next, setNext] = useState(value.next_run_on ?? nextRun(isoToday().slice(0, 8) + '01', 'monthly'));
  const [end, setEnd] = useState(value.end_on ?? '');
  const opts = templates.filter((t) => t.client_id === client);
  const [tpl, setTpl] = useState(value.template?.id ?? opts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveSchedule({ id: value.id ?? null, client_id: client, template_invoice_id: tpl || null, frequency: freq, next_run_on: next, end_on: end || null, active: value.active ?? true });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message ?? 'Saved' });
      router.refresh();
      onDone();
    });
  }
  return (
    <form id="schedule-form" onSubmit={submit}>
      <Section footer="Each draft copies the template’s lines and moves month names forward. Nothing is emailed.">
        <Select label="Client" value={client} disabled={!!value.id} onChange={(e) => { setClient(e.target.value); setTpl(templates.find((t) => t.client_id === e.target.value)?.id ?? ''); }} placeholder="Choose client" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="Copy from" value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="Latest invoice" options={opts.map((t) => ({ value: t.id, label: t.label }))} />
        <Select label="Repeats" value={freq} onChange={(e) => setFreq(e.target.value)} options={FREQUENCIES} />
        <Input label="Next draft" type="date" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} align="right" />
        <Input label="Ends" type="date" value={end} min={next} onChange={(e) => setEnd(e.target.value)} align="right" />
      </Section>
      {error && <p className="mb-3 px-1 text-subhead text-red" role="alert">{error}</p>}
      <button type="submit" className="sr-only">Save</button>
    </form>
  );
}
