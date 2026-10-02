'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, Ellipsis, FileSpreadsheet, Undo2 } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { EmptyState } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { date, plural, relativeDay } from '@/lib/format';
import { undoImport } from '@/app/(app)/banking/actions';
import { AccountTile } from './bits';

export type HistoryRow = {
  id: string; fileName: string; accountName: string; accountKind: string; accountColor: string | null;
  dateFrom: string | null; dateTo: string | null; imported: number; duplicates: number; matched: number;
  by: string | null; at: string; hasFile: boolean;
};

function range(from: string | null, to: string | null) {
  if (!from || !to) return '';
  if (from.slice(0, 7) === to.slice(0, 7)) return `${date(from, 'MMM d')}–${date(to, 'd, yyyy')}`;
  return `${date(from, 'MMM d')} – ${date(to, 'MMM d, yyyy')}`;
}

export function ImportHistory({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function undo(r: HistoryRow) {
    const ok = await confirm({
      title: `Undo “${r.fileName}”?`,
      message: `Removes the transactions from this import that haven’t been matched or recorded. Anything already matched stays. This can’t be undone.`,
      confirmLabel: 'Undo import', destructive: true,
    });
    if (!ok) return;
    setBusy(r.id);
    const res = await undoImport(r.id);
    setBusy(null);
    toast(res.ok ? { title: res.message ?? 'Import undone' } : { title: res.error, tone: 'error' });
    router.refresh();
  }

  if (!rows.length) {
    return (
      <Section title="Import history">
        <EmptyState icon={<FileSpreadsheet />} title="No imports yet" message="Download a CSV from EQ Bank or your card and import it here." action={<Button href="/banking/import" variant="tinted">Import a statement</Button>} />
      </Section>
    );
  }
  const list = showAll ? rows : rows.slice(0, 8);
  return (
    <Section
      title="Import history" inset={58}
      footer={rows.length > 8 && !showAll ? <button type="button" className="font-medium text-accent-text" onClick={() => setShowAll(true)}>Show all {rows.length}</button> : undefined}
    >
      {list.map((r) => {
        const items: MenuItem[] = [
          ...(r.hasFile ? [{ label: 'Download original CSV', icon: <Download />, href: `/api/banking/imports/${r.id}?download=1`, external: true }] : []),
          { label: 'Undo import', icon: <Undo2 />, destructive: true, onSelect: () => undo(r), disabled: busy === r.id },
        ];
        return (
          <div key={r.id} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
            <AccountTile kind={r.accountKind} color={r.accountColor} />
            <div className="min-w-0 flex-1 py-2.5">
              <p className="truncate font-medium">{r.fileName}</p>
              <p className="truncate text-footnote text-label-2">{r.accountName} · {range(r.dateFrom, r.dateTo)}</p>
              <p className="truncate text-footnote text-label-3">{relativeDay(r.at)}{r.by ? ` · ${r.by.split(' ')[0]}` : ''}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular text-subhead">{plural(r.imported, 'row')}</p>
              <p className="tabular text-footnote text-label-3">{r.duplicates ? `${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} skipped` : r.matched ? `${r.matched} auto-matched` : 'No duplicates'}</p>
            </div>
            <Menu label="Import options" items={items} trigger={
              <button type="button" aria-label={`Options for ${r.fileName}`} className="pressable -mr-1 flex size-9 items-center justify-center rounded-full text-label-2 hover:bg-fill-2 lg:size-7">
                <Ellipsis className="size-5" />
              </button>
            } />
          </div>
        );
      })}
    </Section>
  );
}
