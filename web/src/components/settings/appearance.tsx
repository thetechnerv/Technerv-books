'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/toast';
import { setTheme, type ThemeChoice } from '@/app/(app)/settings/actions';

const OPTIONS: { value: ThemeChoice; label: string; note: string }[] = [
  { value: 'system', label: 'System', note: 'Match this device' },
  { value: 'light', label: 'Light', note: 'Always light' },
  { value: 'dark', label: 'Dark', note: 'Always dark' },
];

/** Appearance applies immediately (like iOS) — it's a preference, not a form. */
export function AppearancePicker({ current }: { current: ThemeChoice }) {
  const [value, setValue] = useState(current);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function choose(v: ThemeChoice) {
    if (v === value) return;
    const prev = value;
    setValue(v);
    start(async () => {
      const r = await setTheme(v);
      if (!r.ok) { setValue(prev); toast({ title: r.error, tone: 'error' }); return; }
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-4 lg:p-3" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => choose(o.value)} className="pressable flex flex-col items-center gap-2 text-center">
          <span className={cn('relative block aspect-[3/4] w-full max-w-[120px] overflow-hidden rounded-[14px] transition-shadow', value === o.value ? 'shadow-[0_0_0_2.5px_var(--accent)]' : 'shadow-[0_0_0_0.5px_var(--separator-strong)]')}>
            {o.value === 'system' ? (
              <span className="absolute inset-0 flex">
                <span className="relative w-1/2 overflow-hidden"><span className="absolute inset-y-0 left-0 w-[200%]"><Mini mode="light" /></span></span>
                <span className="relative w-1/2 overflow-hidden"><span className="absolute inset-y-0 right-0 w-[200%]"><Mini mode="dark" /></span></span>
              </span>
            ) : (
              <Mini mode={o.value} />
            )}
          </span>
          <span className="flex items-center gap-1 text-subhead font-semibold">
            <span className={cn('flex size-[18px] items-center justify-center rounded-full', value === o.value ? 'bg-accent text-on-accent' : 'shadow-[inset_0_0_0_1.5px_var(--label-4)]')}>
              {value === o.value && <Check className="size-3" strokeWidth={3.5} />}
            </span>
            {o.label}
          </span>
          <span className="-mt-1.5 text-caption text-label-2">{o.note}</span>
        </button>
      ))}
    </div>
  );
}

/** A tiny app screenshot drawn with each theme's actual colours (fixed on purpose — it depicts that theme). */
function Mini({ mode }: { mode: 'light' | 'dark' }) {
  const c = mode === 'light'
    ? { bg: '#f2f4f5', cell: '#ffffff', line: 'rgba(23,34,37,0.14)', strong: 'rgba(23,34,37,0.7)' }
    : { bg: '#070b0c', cell: '#111a1c', line: 'rgba(222,236,239,0.14)', strong: 'rgba(222,236,239,0.75)' };
  return (
    <span className="absolute inset-0 block p-[10%]" style={{ background: c.bg }}>
      <span className="block h-[7%] w-[55%] rounded-full" style={{ background: c.strong }} />
      <span className="mt-[10%] block rounded-[6px] p-[8%]" style={{ background: c.cell }}>
        <span className="block h-[10px] w-[60%] rounded-full" style={{ background: '#03DDAA' }} />
        <span className="mt-[10%] block h-[4px] w-[85%] rounded-full" style={{ background: c.line }} />
        <span className="mt-[8%] block h-[4px] w-[70%] rounded-full" style={{ background: c.line }} />
      </span>
      <span className="mt-[8%] block space-y-[6%] rounded-[6px] p-[8%]" style={{ background: c.cell }}>
        {[80, 65, 75].map((w) => <span key={w} className="block h-[4px] rounded-full" style={{ width: `${w}%`, background: c.line }} />)}
      </span>
    </span>
  );
}
