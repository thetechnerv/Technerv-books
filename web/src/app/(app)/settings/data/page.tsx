import { Download, FlaskConical } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Section, Row } from '@/components/ui/group';
import { db } from '@/lib/db';
import { bytes, plural } from '@/lib/format';

export const metadata = { title: 'Data & storage' };

const COUNTED = [
  { table: 'invoices', label: 'Invoices, estimates & credit notes' },
  { table: 'expenses', label: 'Expenses' },
  { table: 'payments', label: 'Payments received' },
  { table: 'clients', label: 'Clients' },
  { table: 'bank_transactions', label: 'Bank transactions' },
  { table: 'mileage_trips', label: 'Trips' },
  { table: 'member_transfers', label: 'Owner transfers' },
  { table: 'documents', label: 'Documents' },
  { table: 'activity_log', label: 'Activity entries' },
] as const;

export default async function DataSettings() {
  const supabase = await db();
  const files: { size_bytes: number | null; original_size_bytes: number | null; mime_type: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('attachments').select('size_bytes, original_size_bytes, mime_type').range(from, from + 999);
    files.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const counts = await Promise.all(COUNTED.map(async (c) => {
    const { count } = await supabase.from(c.table).select('id', { count: 'exact', head: true });
    return { ...c, count: count ?? 0 };
  }));

  const used = files.reduce((s, f) => s + Number(f.size_bytes ?? 0), 0);
  const original = files.reduce((s, f) => s + Number(f.original_size_bytes ?? f.size_bytes ?? 0), 0);
  const saved = Math.max(0, original - used);
  const kinds = [
    { label: 'Photos & scans', test: (m: string) => m.startsWith('image/') },
    { label: 'PDFs', test: (m: string) => m === 'application/pdf' },
    { label: 'Other files', test: (m: string) => !m.startsWith('image/') && m !== 'application/pdf' },
  ].map((k) => {
    const list = files.filter((f) => k.test(f.mime_type ?? ''));
    return { label: k.label, n: list.length, size: list.reduce((s, f) => s + Number(f.size_bytes ?? 0), 0) };
  });
  const pctSaved = original ? Math.round((saved / original) * 100) : 0;

  return (
    <Page title="Data & storage" back={{ href: '/settings', label: 'Settings' }}>
      <div className="lg:max-w-[720px]">
        <Section title="Storage" footer="Photos are converted to WebP and text files gzipped before upload; PDFs are stored as they are.">
          <div className="px-4 py-4 lg:px-3">
            <div className="flex items-baseline justify-between">
              <span className="tabular text-title2 font-semibold">{bytes(used)}</span>
              <span className="text-footnote text-label-2">{plural(files.length, 'file')}</span>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-fill" role="img" aria-label={`${bytes(used)} stored, ${bytes(saved)} saved by compression`}>
              <span style={{ width: `${100 - pctSaved}%`, background: 'var(--chart-in)' }} />
              <span style={{ width: `${pctSaved}%`, background: 'var(--accent-soft)' }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-label-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: 'var(--chart-in)' }} />Stored {bytes(used)}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]" />Saved by compression {bytes(saved)}{pctSaved ? ` (${pctSaved}%)` : ''}</span>
            </div>
          </div>
          {kinds.map((k) => <Row key={k.label} title={k.label} value={bytes(k.size)} detail={plural(k.n, 'file')} />)}
        </Section>

        <Section title="Records">
          {counts.map((c) => <Row key={c.table} title={c.label} value={c.count.toLocaleString('en-CA')} />)}
        </Section>

        <Section title="Export" footer="A .zip with one CSV per table — every record in the books, ready for your accountant or a backup. Attached files aren’t included.">
          <a href="/api/settings/export" download className="row-press flex min-h-[var(--row-h)] items-center gap-3 px-4 text-accent-text lg:px-3">
            <Download className="size-5" />
            <span className="flex-1 font-medium">Export everything</span>
            <span className="text-footnote text-label-3">CSV · ZIP</span>
          </a>
        </Section>

        <Section>
          <div className="flex gap-3 px-4 py-3.5 lg:px-3">
            <FlaskConical className="mt-0.5 size-5 shrink-0 text-purple" />
            <div>
              <p className="font-semibold">This workspace contains sample data</p>
              <p className="mt-0.5 text-subhead text-label-2">
                The clients, invoices, expenses and receipts here are realistic examples for trying the app. Before going live, the
                owners will ask for a fresh start: every sample record and file is cleared, while settings, members, accounts,
                categories and tax rates are kept. That’s done by the developer, not from this screen.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </Page>
  );
}
