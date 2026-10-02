'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Check, ExternalLink, ImageUp, Loader2 } from 'lucide-react';
import { LogoMark } from '@/components/shell/logo';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { bytes } from '@/lib/format';
import { createLogoUpload, setLogo } from '@/app/(app)/settings/branding/actions';
import { ACCENTS, THEMES, isHex, type InvoiceTheme } from './validate';
import { TextField, useSettingsForm } from './settings-form';

const browser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

/** Resize to ≤ 1200px and re-encode in the same format (PNG keeps transparency). */
async function compressLogo(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type, file.type === 'image/jpeg' ? 0.88 : undefined));
  return out && out.size < file.size ? out : file;
}

export function LogoPicker({ logoPath }: { logoPath: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  async function apply(path: string | null, title: string) {
    const r = await setLogo(path);
    if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
    const previous = r.data?.previous ?? null;
    toast({
      title,
      action: { label: 'Undo', onClick: async () => { await setLogo(previous); start(() => router.refresh()); } },
    });
    start(() => router.refresh());
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast({ title: 'Use a PNG or JPEG image.', tone: 'error' }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ title: 'That image is over 15 MB.', tone: 'error' }); return; }
    setBusy(true);
    try {
      const blob = await compressLogo(file);
      const up = await createLogoUpload(file.type);
      if (!up.ok) throw new Error(up.error);
      const { error } = await browser().storage.from('accounts').uploadToSignedUrl(up.data!.path, up.data!.token, blob, { contentType: file.type });
      if (error) throw new Error(error.message);
      const saved = file.size - blob.size;
      await apply(up.data!.path, saved > 10_000 ? `Logo updated · ${bytes(saved)} smaller` : 'Logo updated');
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 lg:px-3">
      <div className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-inset shadow-[inset_0_0_0_0.5px_var(--separator-strong)]">
        {logoPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/settings/logo?v=${encodeURIComponent(logoPath)}`} alt="Company logo" className="max-h-[60px] max-w-[60px] object-contain" />
        ) : (
          <LogoMark size={52} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">{logoPath ? 'Custom logo' : 'Tech Nerv mark'}</p>
        <p className="text-footnote text-label-2">PNG or JPEG. Resized and compressed before upload.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="tinted" icon={busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} disabled={busy} onClick={() => input.current?.click()}>
            {logoPath ? 'Replace' : 'Upload logo'}
          </Button>
          {logoPath && <Button type="button" size="sm" variant="gray" onClick={() => apply(null, 'Using the Tech Nerv mark')}>Use Tech Nerv mark</Button>}
        </div>
      </div>
    </div>
  );
}

const THEME_INFO: Record<InvoiceTheme, { label: string; note: string; bg: string; fg: string; band: string }> = {
  studio: { label: 'Studio', note: 'Light, accent header', bg: '#ffffff', fg: '#0c1113', band: 'accent' },
  midnight: { label: 'Midnight', note: 'Dark header band', bg: '#ffffff', fg: '#0c1113', band: '#0c1113' },
  minimal: { label: 'Minimal', note: 'Black and white', bg: '#ffffff', fg: '#0c1113', band: 'none' },
};

/** Theme cards, accent swatches and logo toggle with a live PDF preview. Posts invoice_theme / invoice_accent / invoice_show_logo. */
export function InvoiceLook({ theme: theme0, accent: accent0, showLogo: showLogo0, logoPath }: { theme: string; accent: string; showLogo: boolean; logoPath: string | null }) {
  const ctx = useSettingsForm();
  const [theme, setThemeState] = useState<InvoiceTheme>((THEMES as readonly string[]).includes(theme0) ? (theme0 as InvoiceTheme) : 'studio');
  const [accent, setAccent] = useState(accent0.toUpperCase());
  const [custom, setCustom] = useState(!ACCENTS.some((a) => a.value === accent0.toUpperCase()));
  const [showLogo, setShowLogo] = useState(showLogo0);
  const validAccent = isHex(accent) ? accent.toUpperCase() : null;

  useEffect(() => { ctx?.markDirty(); }, [theme, accent, showLogo, ctx]);

  return (
    <>
      <div className="lg:grid lg:grid-cols-[1fr_240px]">
        <div>
          <div className="px-4 pb-1 pt-3 text-footnote font-medium text-label-2 lg:px-3">Theme</div>
          <div className="grid grid-cols-3 gap-2.5 px-4 pb-3 lg:px-3" role="radiogroup" aria-label="Invoice theme">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => setThemeState(t)}
                className={cn('pressable rounded-[12px] p-1.5 text-left transition-shadow', theme === t ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[inset_0_0_0_0.5px_var(--separator-strong)]')}
              >
                <ThemeThumb theme={t} accent={validAccent ?? '#03DDAA'} />
                <div className="mt-1.5 flex items-center gap-1 px-0.5">
                  <span className="flex-1 text-footnote font-semibold">{THEME_INFO[t].label}</span>
                  {theme === t && <Check className="size-3.5 text-accent-text" strokeWidth={3} />}
                </div>
                <div className="px-0.5 text-caption2 text-label-3">{THEME_INFO[t].note}</div>
              </button>
            ))}
          </div>

          <div className="hairline-t px-4 pb-1 pt-3 text-footnote font-medium text-label-2 lg:px-3">Accent</div>
          <div className="flex flex-wrap items-center gap-2.5 px-4 pb-3 lg:px-3" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={!custom && accent === a.value}
                aria-label={a.label}
                title={`${a.label} ${a.value}`}
                onClick={() => { setCustom(false); setAccent(a.value); }}
                className={cn('pressable flex size-9 items-center justify-center rounded-full lg:size-8', !custom && accent === a.value && 'shadow-[0_0_0_2px_var(--bg-cell),0_0_0_4px_var(--label-3)]')}
                style={{ background: a.value }}
              >
                {!custom && accent === a.value && <Check className="size-4" style={{ color: a.value === '#03DDAA' ? '#032920' : '#fff' }} strokeWidth={3} />}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => setCustom(true)}
              className={cn('pressable flex h-9 items-center gap-2 rounded-full px-3 text-subhead font-medium lg:h-8', custom ? 'bg-label text-bg' : 'bg-fill text-label')}
            >
              <span className="size-4 rounded-full" style={{ background: 'conic-gradient(#E0352B, #E5A00D, #03DDAA, #0680A2, #7C4DDB, #E0352B)' }} />
              Custom
            </button>
          </div>
          {custom && (
            <div className="flex items-center gap-2 pr-4 hairline-t lg:pr-3">
              <div className="flex-1">
                <TextField
                  name="invoice_accent"
                  label="Hex"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value.toUpperCase())}
                  placeholder="#03DDAA"
                  maxLength={7}
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </div>
              <input
                type="color"
                aria-label="Pick a colour"
                value={validAccent ?? '#03DDAA'}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                className="size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
            </div>
          )}
          {!custom && <input type="hidden" name="invoice_accent" value={accent} />}
          <input type="hidden" name="invoice_theme" value={theme} />
          <div className="hairline-t">
            <Toggle label="Show logo on invoices" hint={logoPath ? 'Uses your uploaded logo.' : 'Uses the Tech Nerv mark.'} name="invoice_show_logo" checked={showLogo} onChange={setShowLogo} />
          </div>
        </div>
        <div className="hairline-t p-4 lg:p-3 lg:shadow-[inset_0.5px_0_0_var(--separator)]">
          <InvoicePreview theme={theme} accent={validAccent ?? '#03DDAA'} showLogo={showLogo} />
        </div>
      </div>
    </>
  );
}

function ThemeThumb({ theme, accent }: { theme: InvoiceTheme; accent: string }) {
  const band = theme === 'studio' ? accent : theme === 'midnight' ? '#0C1113' : 'transparent';
  return (
    <div className="aspect-[8.5/11] overflow-hidden rounded-[7px] bg-white shadow-[0_0_0_0.5px_rgba(12,17,19,0.12)]">
      <div className="h-[22%] px-[10%] pt-[10%]" style={{ background: band }}>
        <div className="h-[6px] w-[40%] rounded-full" style={{ background: theme === 'midnight' ? '#ffffff' : theme === 'minimal' ? '#0C1113' : 'rgba(12,17,19,0.75)' }} />
      </div>
      <div className="space-y-[6%] px-[10%] pt-[10%]">
        {[70, 90, 55, 80].map((w, i) => <div key={i} className="h-[3px] rounded-full bg-[rgba(12,17,19,0.14)]" style={{ width: `${w}%` }} />)}
        <div className="ml-auto mt-[12%] h-[5px] w-[35%] rounded-full" style={{ background: theme === 'minimal' ? '#0C1113' : accent }} />
      </div>
    </div>
  );
}

type PreviewState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'unavailable' };

/** Embeds /api/invoices/sample/pdf; falls back to a drawn preview while that endpoint isn't available. */
function InvoicePreview({ theme, accent, showLogo }: { theme: InvoiceTheme; accent: string; showLogo: boolean }) {
  const params = useDebounced(`theme=${theme}&accent=${encodeURIComponent(accent)}&logo=${showLogo ? 1 : 0}`, 450);
  const src = `/api/invoices/sample/pdf?${params}`;
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    const ctl = new AbortController();
    let url: string | null = null;
    fetch(src, { signal: ctl.signal })
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.includes('pdf')) throw new Error('unavailable');
        url = URL.createObjectURL(await res.blob());
        setState({ status: 'ready', url });
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setState({ status: 'unavailable' }); });
    return () => { ctl.abort(); if (url) URL.revokeObjectURL(url); };
  }, [src]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-footnote font-medium text-label-2">Preview</span>
        {state.status === 'ready' && (
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-footnote font-medium text-accent-text">
            Open <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      <div className="relative aspect-[8.5/11] overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_0.5px_var(--separator-strong),0_6px_18px_-8px_rgba(12,17,19,0.25)]">
        {state.status === 'ready' ? (
          <iframe key={state.url} src={`${state.url}#toolbar=0&navpanes=0&view=FitH`} title="Invoice preview" className="absolute inset-0 size-full border-0" />
        ) : (
          <>
            <DrawnInvoice theme={theme} accent={accent} showLogo={showLogo} />
            {state.status === 'loading' && <Loader2 className="absolute right-2 top-2 size-4 animate-spin text-[rgba(12,17,19,0.4)]" />}
          </>
        )}
      </div>
      {state.status === 'unavailable' && (
        <p className="mt-1.5 text-caption text-label-3">Approximate preview — the PDF preview appears here once the invoice renderer is available.</p>
      )}
    </div>
  );
}

/** A small HTML sketch of the invoice so the preview is never blank. Uses fixed print colours on purpose (it depicts paper). */
function DrawnInvoice({ theme, accent, showLogo }: { theme: InvoiceTheme; accent: string; showLogo: boolean }) {
  const dark = theme === 'midnight';
  const head = theme === 'studio' ? accent : dark ? '#0C1113' : '#ffffff';
  const headFg = dark ? '#ffffff' : '#0C1113';
  const strong = theme === 'minimal' ? '#0C1113' : accent;
  return (
    <div className="absolute inset-0 flex flex-col text-[7px] leading-[1.35] text-[#0C1113]">
      <div className="flex items-start justify-between px-[9%] pb-[5%] pt-[8%]" style={{ background: head, color: headFg }}>
        <div className="flex items-center gap-1">
          {showLogo && <LogoMark size={14} />}
          <span className="font-semibold">Tech Nerv</span>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold tracking-tight">INVOICE</div>
          <div className="opacity-70">TN-1092</div>
        </div>
      </div>
      {theme === 'minimal' && <div className="mx-[9%] h-px bg-[#0C1113]" />}
      <div className="flex justify-between px-[9%] pt-[6%] text-[6px]">
        <div><div className="opacity-50">Bill to</div><div className="font-semibold">Northwind Dental</div></div>
        <div className="text-right"><div className="opacity-50">Due</div><div className="font-semibold">Oct 17, 2026</div></div>
      </div>
      <div className="mx-[9%] mt-[6%] space-y-[3px] text-[6px]">
        {[['Discovery & scoping', '750.00'], ['Voice AI Receptionist — build', '12,000.00'], ['Support retainer', '850.00']].map(([d, a]) => (
          <div key={d} className="flex justify-between border-b border-[rgba(12,17,19,0.08)] pb-[3px]"><span>{d}</span><span className="tabular">{a}</span></div>
        ))}
      </div>
      <div className="mx-[9%] mt-[5%] flex justify-end">
        <div className="rounded-[3px] px-1.5 py-1 text-[7px] font-bold" style={{ background: theme === 'minimal' ? 'transparent' : `color-mix(in srgb, ${strong} 16%, white)`, color: theme === 'minimal' ? '#0C1113' : '#0C1113', boxShadow: theme === 'minimal' ? 'inset 0 0 0 0.5px #0C1113' : undefined }}>
          Total $14,280.00
        </div>
      </div>
      <div className="mt-auto px-[9%] pb-[7%] text-[5.5px] opacity-50">Thank you for building with Tech Nerv.</div>
    </div>
  );
}

/** Prefix + next number for invoices and estimates, warning when the next number is already used. */
export function Numbering({ kind, prefix, seq, used }: { kind: 'invoice' | 'estimate'; prefix: string; seq: number; used: string[] }) {
  const ctx = useSettingsForm();
  const [p, setP] = useState(prefix);
  const [n, setN] = useState(String(seq));
  const taken = new Set(used);
  const nextFree = (() => {
    let i = Math.max(1, Number(n) || 1);
    while (taken.has(`${p}${i}`)) i++;
    return i;
  })();
  const label = kind === 'invoice' ? 'Invoice' : 'Estimate';
  const seqName = kind === 'invoice' ? 'next_invoice_seq' : 'next_estimate_seq';
  const preName = kind === 'invoice' ? 'invoice_prefix' : 'estimate_prefix';

  useEffect(() => {
    if (!ctx) return;
    return ctx.register(seqName, (v, fd) => {
      const pre = String(fd.get(preName) ?? '');
      if (!/^\d+$/.test(v.trim()) || Number(v) < 1) return 'Enter a whole number.';
      return taken.has(`${pre}${Number(v)}`) ? `${pre}${Number(v)} already exists.` : null;
    });
  // `taken` is derived from props; re-register when they change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, seqName, preName, used]);

  const dup = taken.has(`${p}${Number(n)}`);
  return (
    <>
      <TextField name={preName} label={`${label} prefix`} value={p} onChange={(e) => setP(e.target.value)} maxLength={12} spellCheck={false} autoCapitalize="characters" />
      <TextField
        name={seqName}
        label="Next number"
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
        hint={dup ? undefined : `Next ${kind} will be ${p}${n || '…'}`}
        trailing={dup ? (
          <button type="button" className="text-subhead font-semibold text-accent-text" onClick={() => { setN(String(nextFree)); requestAnimationFrame(() => ctx?.validateField(seqName)); }}>
            Use {nextFree}
          </button>
        ) : undefined}
      />
      {dup && !ctx?.errors[seqName] && <p className="-mt-1 px-4 pb-2 text-footnote text-orange lg:px-3">{p}{n} already exists — the next {kind} would clash. Next free: {nextFree}.</p>}
    </>
  );
}
