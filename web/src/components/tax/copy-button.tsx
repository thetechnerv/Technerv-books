'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/** Copies a plain number (no $ or commas) for pasting into CRA My Business Account. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
      toast({ title: `Copied ${label}: ${value}` });
    } catch {
      toast({ title: 'Couldn’t copy — select the number instead', tone: 'error' });
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title={`Copy ${value}`}
      className={cn('pressable inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-fill px-2.5 text-footnote font-semibold text-accent-text hover:bg-fill-3 lg:h-7', className)}
    >
      {done ? <Check className="size-3.5" strokeWidth={2.6} /> : <Copy className="size-3.5" strokeWidth={2.2} />}
      <span className="hidden sm:inline">{done ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
