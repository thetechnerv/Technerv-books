'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Camera, FileText, Paperclip, Trash2, Download, X, Loader2, ImageIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { prepareFile } from '@/lib/compress';
import { createUpload, registerAttachment, deleteAttachment, type EntityType } from '@/lib/storage';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { bytes } from '@/lib/format';
import { cn } from '@/lib/cn';

export type Attachment = { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; original_size_bytes: number | null; compression: string | null };

const browser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

/** Compress → signed upload → register. Returns the new attachment id. */
export async function uploadAttachment(file: File, entity: EntityType, entityId: string) {
  const prepared = await prepareFile(file);
  const up = await createUpload(entity, entityId, prepared.name);
  if (!up.ok) throw new Error(up.error);
  const { error } = await browser().storage.from('accounts').uploadToSignedUrl(up.data!.path, up.data!.token, prepared.blob, { contentType: prepared.type });
  if (error) throw new Error(error.message);
  const reg = await registerAttachment({
    entity, entityId, path: up.data!.path, fileName: prepared.name, mimeType: prepared.type,
    size: prepared.blob.size, originalSize: prepared.originalSize, compression: prepared.compression,
  });
  if (!reg.ok) throw new Error(reg.error);
  return { id: reg.data!.id, saved: prepared.originalSize - prepared.blob.size };
}

/**
 * Thumbnails for an entity's files plus "Take photo" / "Add file" buttons.
 * Tapping a thumbnail opens a full-screen viewer with download and delete.
 */
export function Attachments({ entity, entityId, items, compact }: { entity: EntityType; entityId: string; items: Attachment[]; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      let saved = 0;
      for (const f of Array.from(files)) saved += (await uploadAttachment(f, entity, entityId)).saved;
      toast({ title: saved > 20_000 ? `Uploaded · saved ${bytes(saved)} with compression` : 'Uploaded' });
      startTransition(() => router.refresh());
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (picker.current) picker.current.value = '';
    }
  }

  async function remove(a: Attachment) {
    if (!(await confirm({ title: 'Delete this file?', message: a.file_name, confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteAttachment(a.id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    setViewing(null);
    toast({ title: 'File deleted' });
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className={cn('flex flex-wrap gap-2.5', compact ? '' : 'p-3')}>
        {items.map((a) => (
          <button key={a.id} type="button" onClick={() => setViewing(a)} className="pressable group relative size-[84px] overflow-hidden rounded-[12px] bg-inset shadow-[inset_0_0_0_0.5px_var(--separator-strong)] lg:size-[76px]">
            {a.mime_type?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files?id=${a.id}`} alt={a.file_name} className="size-full object-cover" loading="lazy" />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 text-label-2">
                <FileText className="size-7" strokeWidth={1.5} />
                <span className="max-w-[90%] truncate text-caption2">{a.file_name.split('.').pop()?.toUpperCase()}</span>
              </span>
            )}
          </button>
        ))}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
        <input ref={picker} type="file" accept="image/*,application/pdf,.csv,.txt,.doc,.docx,.xls,.xlsx" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="pressable flex size-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-separator-strong text-accent-text lg:hidden">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
          <span className="text-caption font-medium">Take photo</span>
        </button>
        <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="pressable flex size-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-separator-strong text-accent-text lg:size-[76px]">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Paperclip className="size-6" />}
          <span className="text-caption font-medium">Add file</span>
        </button>
      </div>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {viewing && <Viewer a={viewing} onClose={() => setViewing(null)} onDelete={() => remove(viewing)} />}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function Viewer({ a, onClose, onDelete }: { a: Attachment; onClose: () => void; onDelete: () => void }) {
  const isImage = a.mime_type?.startsWith('image/');
  const isPdf = a.mime_type === 'application/pdf';
  return (
    <motion.div className="fixed inset-0 z-[70] flex flex-col bg-black/90 text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="flex items-center gap-2 px-3 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
        <button onClick={onClose} className="pressable flex size-9 items-center justify-center rounded-full bg-white/15" aria-label="Close"><X className="size-5" /></button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-subhead font-semibold">{a.file_name}</div>
          <div className="text-caption text-white/60">
            {bytes(a.size_bytes)}
            {a.compression && a.original_size_bytes && a.size_bytes ? ` · compressed from ${bytes(a.original_size_bytes)}` : ''}
          </div>
        </div>
        <a href={`/api/files?id=${a.id}&download=1`} className="pressable flex size-9 items-center justify-center rounded-full bg-white/15" aria-label="Download"><Download className="size-5" /></a>
        <button onClick={onDelete} className="pressable flex size-9 items-center justify-center rounded-full bg-white/15 text-[#ff6159]" aria-label="Delete"><Trash2 className="size-5" /></button>
      </div>
      <motion.div className="flex min-h-0 flex-1 items-center justify-center p-3" initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files?id=${a.id}`} alt={a.file_name} className="max-h-full max-w-full rounded-[10px] object-contain" />
        ) : isPdf ? (
          <iframe src={`/api/files?id=${a.id}`} title={a.file_name} className="size-full max-w-[900px] rounded-[10px] bg-white" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/70"><ImageIcon className="size-10" />No preview — download to open.</div>
        )}
      </motion.div>
    </motion.div>
  );
}
