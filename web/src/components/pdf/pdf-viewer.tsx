'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Load pdf.js once, with its worker bundled by Turbopack via `new URL(…, import.meta.url)`. */
function loadPdfJs() {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Renders every page of a PDF to canvases sized for the device pixel ratio,
 * so text stays crisp on retina screens. Re-renders on width change; pinch-zoom
 * works natively (canvases are plain images to the browser), and +/- zoom on desktop.
 */
export function PdfViewer({ src, className, label = 'Document preview' }: { src: string; className?: string; label?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [loaded, setLoaded] = useState<{ src: string; status: 'ready' | 'error' } | null>(null);
  const state: 'loading' | 'ready' | 'error' = loaded?.src === src ? loaded.status : 'loading';
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const docRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const taskRef = useRef<import('pdfjs-dist').PDFDocumentLoadingTask | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({ url: src, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) { void task.destroy(); return; }
        void taskRef.current?.destroy();
        taskRef.current = task;
        docRef.current = doc;
        setPages(doc.numPages);
        setLoaded({ src, status: 'ready' });
      } catch (e) {
        console.error('PDF preview failed', e);
        if (!cancelled) setLoaded({ src, status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => () => { void taskRef.current?.destroy(); }, []);

  // Render pages whenever size, zoom or document changes.
  useEffect(() => {
    const doc = docRef.current;
    if (state !== 'ready' || !doc || !width) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const page = await doc.getPage(n);
        const canvas = canvases.current[n - 1];
        if (!canvas) continue;
        const base = page.getViewport({ scale: 1 });
        const cssW = width * zoom;
        const scale = cssW / base.width;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(cssW)}px`;
        canvas.style.height = `${Math.floor(base.height * scale)}px`;
        const task = page.render({ canvas, viewport });
        tasks.push(task);
        try { await task.promise; } catch { /* cancelled by a newer render */ }
      }
    })();
    return () => { cancelled = true; tasks.forEach((t) => t.cancel()); };
  }, [state, width, zoom, pages]);

  return (
    <div className={cn('relative', className)} aria-label={label} role="document">
      <div ref={wrap} className="w-full overflow-x-auto overscroll-x-contain">
        {state === 'error' ? (
          <div className="flex aspect-[8.5/11] w-full flex-col items-center justify-center gap-2 rounded-[10px] bg-cell text-center text-subhead text-label-2 shadow-card">
            <AlertCircle className="size-6 text-label-3" />
            Couldn’t show the preview.
            <a href={src} target="_blank" rel="noreferrer" className="font-medium text-accent-text">Open the PDF</a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ width: zoom > 1 ? `${zoom * 100}%` : undefined }}>
            {state === 'loading' && <div className="aspect-[8.5/11] w-full animate-pulse rounded-[6px] bg-cell shadow-card" />}
            {Array.from({ length: state === 'ready' ? pages : 0 }).map((_, i) => (
              <canvas
                key={`${src}-${i}`}
                ref={(c) => { canvases.current[i] = c; }}
                className="block rounded-[3px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_28px_-6px_rgba(12,17,19,0.18),0_0_0_0.5px_rgba(12,17,19,0.08)]"
                style={{ aspectRatio: '8.5 / 11', width: '100%' }}
                aria-label={`Page ${i + 1} of ${pages}`}
              />
            ))}
          </div>
        )}
      </div>
      {state === 'ready' && (
        <div className="mt-2.5 flex items-center justify-center gap-3 text-footnote text-label-3">
          <span className="tabular">{pages === 1 ? '1 page' : `${pages} pages`}</span>
          <span className="hidden items-center gap-1 lg:inline-flex">
            <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1} aria-label="Zoom out" className="rounded-full p-1 hover:bg-fill-2 disabled:opacity-30"><Minus className="size-3.5" /></button>
            <span className="tabular w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} disabled={zoom >= 2.5} aria-label="Zoom in" className="rounded-full p-1 hover:bg-fill-2 disabled:opacity-30"><Plus className="size-3.5" /></button>
          </span>
        </div>
      )}
    </div>
  );
}
