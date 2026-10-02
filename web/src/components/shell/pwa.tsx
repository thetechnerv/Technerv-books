'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff, ArrowDown, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

/** True when running from the home screen (iOS or Android). */
export function useStandalone() {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia('(display-mode: standalone)'); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); },
    () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Registers the service worker (production, or dev with NEXT_PUBLIC_SW_IN_DEV=1),
 * offers "Reload" when a new version is ready, and shows an offline pill.
 */
export function PwaManager() {
  const toast = useToast();
  const online = useOnline();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_SW_IN_DEV !== '1') return;
    let reloading = false;
    const onControllerChange = () => { if (!reloading) { reloading = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((reg) => {
      const offer = (w: ServiceWorker) =>
        toast({ title: 'A new version of the app is ready', tone: 'info', action: { label: 'Reload', onClick: () => w.postMessage('SKIP_WAITING') } });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      // Check for updates when the app comes back to the foreground.
      const onVisible = () => document.visibilityState === 'visible' && reg.update().catch(() => {});
      document.addEventListener('visibilitychange', onVisible);
    }).catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, [toast]);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
          className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+6px)] z-[85] flex justify-center px-4"
        >
          <div className="material-glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-footnote font-semibold">
            <WifiOff className="size-4 text-orange" /> Offline — changes can’t be saved until you reconnect
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const THRESHOLD = 72;

/**
 * Pull-to-refresh for the home-screen app (standalone mode has no browser
 * reload). Only engages when the page is scrolled to the very top and the
 * gesture starts outside sheets, horizontal scrollers and inputs.
 */
export function PullToRefresh() {
  const standalone = useStandalone();
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const engaged = useRef(false);

  useEffect(() => {
    if (!standalone) return;
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      if (window.scrollY > 0 || refreshing || t.closest('[role=dialog], input, textarea, select, [data-no-ptr], .overflow-x-auto, .no-scrollbar')) { start.current = null; return; }
      start.current = { y: e.touches[0]!.clientY, x: e.touches[0]!.clientX };
      engaged.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0]!.clientY - start.current.y;
      const dx = Math.abs(e.touches[0]!.clientX - start.current.x);
      if (!engaged.current) {
        if (dy > 10 && dy > dx * 1.5 && window.scrollY <= 0) engaged.current = true;
        else if (dy < 0 || dx > 10) { start.current = null; return; }
      }
      if (engaged.current) {
        e.preventDefault();
        // Rubber-band: the further you pull, the less it follows.
        setPull((dy * 0.55 * 120) / (120 + dy * 0.55));
      }
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      setPull((p) => {
        if (p >= THRESHOLD * 0.85) {
          setRefreshing(true);
          try { navigator.vibrate?.(8); } catch {}
          router.refresh();
          setTimeout(() => { setRefreshing(false); setPull(0); }, 900);
          return THRESHOLD * 0.8;
        }
        return 0;
      });
    };
    addEventListener('touchstart', onStart, { passive: true });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
    return () => {
      removeEventListener('touchstart', onStart);
      removeEventListener('touchmove', onMove);
      removeEventListener('touchend', onEnd);
      removeEventListener('touchcancel', onEnd);
    };
  }, [standalone, refreshing, router]);

  if (!standalone || (pull === 0 && !refreshing)) return null;
  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center lg:hidden" style={{ top: `calc(var(--safe-top) + ${Math.max(4, pull - 34)}px)` }}>
      <div className="material-glass flex size-9 items-center justify-center rounded-full" style={{ opacity: Math.max(0.2, progress) }}>
        {refreshing
          ? <Loader2 className="size-[18px] animate-spin text-accent-text" />
          : <ArrowDown className="size-[18px] text-accent-text transition-transform" style={{ transform: `rotate(${progress >= 0.85 ? 180 : 0}deg)` }} />}
      </div>
    </div>
  );
}
