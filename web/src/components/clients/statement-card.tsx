'use client';
import { useState, useSyncExternalStore } from 'react';
import { Download, Eye, Share } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { Chips, Input } from '@/components/ui/fields';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export type StatementPreset = { key: string; label: string; from: string; to: string };

const btn = 'pressable inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-body aria-disabled:pointer-events-none aria-disabled:opacity-40 lg:h-8 lg:rounded-sm lg:px-3 lg:text-subhead';
const subscribe = () => () => {};
const canShareFiles = () => {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] });
  } catch { return false; }
};

/** Statement of account: pick a period, then view, download or share the PDF. */
export function StatementCard({ clientId, fileName, presets }: { clientId: string; fileName: string; presets: StatementPreset[] }) {
  const toast = useToast();
  const [preset, setPreset] = useState(presets[0]!.key);
  const [range, setRange] = useState({ from: presets[0]!.from, to: presets[0]!.to });
  const [sharing, setSharing] = useState(false);
  const shareable = useSyncExternalStore(subscribe, canShareFiles, () => false);

  const valid = !!range.from && !!range.to && range.from <= range.to;
  const url = (download = false) => `/api/clients/${clientId}/statement?from=${range.from}&to=${range.to}${download ? '&download=1' : ''}`;

  function choose(key: string) {
    setPreset(key);
    const p = presets.find((x) => x.key === key);
    if (p) setRange({ from: p.from, to: p.to });
  }

  async function share() {
    setSharing(true);
    try {
      const res = await fetch(url());
      if (!res.ok) throw new Error('Couldn’t build the statement');
      const blob = await res.blob();
      const file = new File([blob], `${fileName}.pdf`, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: fileName });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ title: (e as Error).message || 'Couldn’t share', tone: 'error' });
    } finally {
      setSharing(false);
    }
  }

  return (
    <Section title="Statement" footer="Opening balance, every invoice, payment and credit in the period, running balance and aging.">
      <div className="px-3 pb-1 pt-3 lg:px-2.5">
        <Chips options={[...presets.map((p) => ({ value: p.key, label: p.label })), { value: 'custom', label: 'Custom' }]} value={preset} onChange={choose} />
      </div>
      {preset === 'custom' && (
        <>
          <Input label="From" type="date" align="right" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <Input label="To" type="date" align="right" value={range.to} min={range.from} error={valid ? null : 'Pick an end date after the start.'} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </>
      )}
      <div className="flex gap-2 p-3 lg:p-2.5">
        <a href={valid ? url() : undefined} target="_blank" rel="noreferrer" aria-disabled={!valid} className={cn(btn, 'bg-accent-soft font-semibold text-accent-text')}>
          <Eye className="size-4" />View
        </a>
        <a href={valid ? url(true) : undefined} aria-disabled={!valid} className={cn(btn, 'bg-fill font-medium text-label hover:bg-fill-3')}>
          <Download className="size-4" />Download
        </a>
        {shareable && (
          <Button variant="gray" className="flex-1" onClick={share} loading={sharing} disabled={!valid} icon={<Share className="size-4" />}>Share</Button>
        )}
      </div>
    </Section>
  );
}
