'use client';
import { useRef, useState } from 'react';
import { Download, Loader2, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '@/components/ui/toast';
import { bytes, plural } from '@/lib/format';
import { cn } from '@/lib/cn';

type State = { phase: 'idle' } | { phase: 'preparing' } | { phase: 'downloading'; got: number; total: number | null } | { phase: 'done' };

/**
 * Downloads the year-end zip with visible progress: an indeterminate
 * "gathering" phase while the server collects receipts and builds the PDF,
 * then a real percentage as bytes arrive.
 */
export function DownloadPackage({ href, fileName, receipts, block }: { href: string; fileName: string; receipts: number; block?: boolean }) {
  const toast = useToast();
  const [s, setS] = useState<State>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);

  async function run() {
    const ctl = new AbortController();
    abort.current = ctl;
    setS({ phase: 'preparing' });
    try {
      const res = await fetch(href, { signal: ctl.signal });
      if (!res.ok || !res.body) throw new Error((await res.text().catch(() => '')) || `Download failed (${res.status})`);
      const total = Number(res.headers.get('Content-Length')) || null;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      setS({ phase: 'downloading', got, total });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        setS({ phase: 'downloading', got, total });
      }
      const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setS({ phase: 'done' });
      toast({ title: `Downloaded ${fileName} · ${bytes(got)}` });
      setTimeout(() => setS({ phase: 'idle' }), 2500);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setS({ phase: 'idle' }); return; }
      toast({ title: (e as Error).message, tone: 'error' });
      setS({ phase: 'idle' });
    }
  }

  const busy = s.phase === 'preparing' || s.phase === 'downloading';
  const pct = s.phase === 'downloading' && s.total ? Math.min(100, Math.round((s.got / s.total) * 100)) : null;
  const label =
    s.phase === 'preparing' ? `Gathering ${plural(receipts, 'receipt')}…`
      : s.phase === 'downloading' ? (pct !== null ? `Downloading ${pct}%` : `Downloading ${bytes(s.got)}`)
        : s.phase === 'done' ? 'Downloaded' : 'Download package';

  return (
    <div className={cn('relative inline-flex items-center gap-2', block && 'w-full')}>
      <button
        type="button"
        onClick={busy ? undefined : run}
        aria-busy={busy}
        className={cn(
          'pressable relative inline-flex h-[50px] items-center justify-center gap-2 overflow-hidden rounded-[14px] bg-accent px-5 text-headline font-semibold text-on-accent lg:h-10 lg:rounded-md lg:text-body',
          block && 'w-full', busy && 'cursor-progress',
        )}
      >
        {/* progress fill */}
        <AnimatePresence>
          {busy && (
            <motion.span
              className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--on-accent)_14%,transparent)]"
              initial={{ width: '0%' }}
              animate={pct !== null ? { width: `${pct}%` } : { width: ['8%', '42%', '8%'] }}
              exit={{ opacity: 0 }}
              transition={pct !== null ? { type: 'spring', bounce: 0, duration: 0.35 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </AnimatePresence>
        <span className="relative inline-flex items-center gap-2">
          {busy ? <Loader2 className="size-[1.1em] animate-spin" /> : s.phase === 'done' ? <CheckCircle2 className="size-[1.1em]" /> : <Download className="size-[1.1em]" />}
          <span className="tabular">{label}</span>
        </span>
      </button>
      {busy && (
        <button type="button" onClick={() => abort.current?.abort()} aria-label="Cancel download" className="pressable inline-flex size-9 items-center justify-center rounded-full bg-fill text-label-2 lg:size-8">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
