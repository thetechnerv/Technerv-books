'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LockOpen, Loader2 } from 'lucide-react';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Select } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { date, plural } from '@/lib/format';
import { previewLock, setLockDate } from '@/app/(app)/settings/actions';

export type CloseOption = { fy: number; label: string; end: string; lockBefore: string };

/** "Close the books": pick a fiscal year end; everything dated on or before it becomes read-only. */
export function CloseBooks({ options, lockedBefore }: { options: CloseOption[]; lockedBefore: string | null }) {
  const [pick, setPick] = useState(options.find((o) => !lockedBefore || o.lockBefore > lockedBefore)?.lockBefore ?? options[0]?.lockBefore ?? '');
  const [counts, setCounts] = useState<{ label: string; count: number }[] | null>(null);
  const [busy, start] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const option = options.find((o) => o.lockBefore === pick);

  useEffect(() => {
    if (!pick) return;
    let live = true;
    previewLock(pick).then((r) => { if (live) setCounts(r.ok ? r.data ?? [] : []); });
    return () => { live = false; setCounts(null); };
  }, [pick]);

  const total = counts?.reduce((s, c) => s + c.count, 0) ?? 0;

  async function close() {
    if (!option) return;
    const ok = await confirm({
      title: `Close the books for ${option.label}?`,
      message: `${plural(total, 'record')} dated on or before ${date(option.end)} will become read-only. You can reopen later if your accountant needs a change.`,
      confirmLabel: 'Close books',
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const r = await setLockDate(option.lockBefore);
      if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
      toast({ title: `Books closed through ${date(option.end)}` });
      router.refresh();
    });
  }

  async function reopen() {
    const ok = await confirm({
      title: 'Reopen the books?',
      message: 'Closed periods become editable again. Changes may no longer match what was filed with CRA.',
      confirmLabel: 'Reopen',
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const r = await setLockDate(null);
      if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
      toast({ title: 'Books reopened' });
      router.refresh();
    });
  }

  return (
    <Section
      title="Close the books"
      inset={58}
      footer="Once your accountant has finished a year, close it so nothing dated in that year can be added, edited or deleted by accident."
    >
      <Row
        icon={<IconTile color={lockedBefore ? '#05A38C' : '#6B7B80'}>{lockedBefore ? <Lock strokeWidth={2.2} /> : <LockOpen strokeWidth={2.2} />}</IconTile>}
        title={lockedBefore ? `Closed through ${date(prevDay(lockedBefore))}` : 'All periods are open'}
        subtitle={lockedBefore ? 'Records dated before this can’t be changed.' : 'Every record can still be edited.'}
      >
        {lockedBefore && <Button size="sm" variant="gray" onClick={reopen} disabled={busy}>Reopen</Button>}
      </Row>
      {options.length > 0 && (
        <>
          <Select
            label="Close through"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={options.map((o) => ({ value: o.lockBefore, label: `${o.label} · ends ${date(o.end)}` }))}
          />
          <div className="px-4 py-3 lg:px-3">
            {counts === null ? (
              <p className="flex items-center gap-2 text-footnote text-label-2"><Loader2 className="size-3.5 animate-spin" /> Counting records…</p>
            ) : (
              <>
                <p className="text-footnote text-label-2">
                  Locks {plural(total, 'record')} dated on or before {option ? date(option.end) : ''}:
                </p>
                <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-footnote">
                  {counts.filter((c) => c.count > 0).map((c) => (
                    <li key={c.label} className="flex justify-between"><span className="text-label-2">{c.label}</span><span className="tabular">{c.count}</span></li>
                  ))}
                </ul>
              </>
            )}
            <Button
              className="mt-3"
              variant="destructive-tinted"
              icon={<Lock className="size-4" />}
              loading={busy}
              disabled={!option || counts === null || (!!lockedBefore && pick <= lockedBefore)}
              onClick={close}
            >
              {lockedBefore && pick <= lockedBefore ? 'Already closed' : `Close ${option?.label ?? ''}`}
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

function prevDay(iso: string) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
