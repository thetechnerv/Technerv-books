'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Share, PlusSquare, MoreVertical, Download, CheckCircle2, Smartphone, X, Zap, Camera, RefreshCw, WifiOff } from 'lucide-react';
import { Section, Row, IconTile } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { useStandalone } from './pwa';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}
/** Android/desktop Chrome's install prompt, captured so we can offer our own button. */
function useInstallPrompt() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => deferred, () => null);
}

function usePlatform() {
  return useSyncExternalStore(() => () => {}, () => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  }, () => 'desktop' as const);
}

export function InstallGuide() {
  const standalone = useStandalone();
  const platform = usePlatform();
  const prompt = useInstallPrompt();

  return (
    <>
      {standalone ? (
        <div className="mb-7 flex items-center gap-3 rounded-group bg-accent-soft p-4 text-accent-text">
          <CheckCircle2 className="size-6 shrink-0" />
          <p className="text-subhead font-medium">You’re using the installed app. Pull down from the top of any screen to refresh.</p>
        </div>
      ) : prompt ? (
        <div className="mb-7 rounded-group bg-cell p-4 shadow-card">
          <p className="mb-3 text-subhead text-label-2">This browser can install the app directly.</p>
          <Button variant="filled" size="lg" block icon={<Download className="size-5" />} onClick={async () => { await prompt.prompt(); }}>Install Tech Nerv Accounts</Button>
        </div>
      ) : null}

      <Section title="iPhone & iPad (Safari)" footer="Use Safari — other iOS browsers also work from iOS 16.4, via their own Share menu." inset={58}>
        <Step n={1} icon={<Share />} title="Tap the Share button" subtitle="In Safari’s toolbar (bottom on iPhone, top on iPad)" highlight={platform === 'ios'} />
        <Step n={2} icon={<PlusSquare />} title="Choose “Add to Home Screen”" subtitle="Scroll the share sheet if you don’t see it" highlight={platform === 'ios'} />
        <Step n={3} icon={<Smartphone />} title="Tap Add" subtitle="The app opens full-screen from its own icon" highlight={platform === 'ios'} />
      </Section>

      <Section title="Android (Chrome)" inset={58}>
        <Step n={1} icon={<MoreVertical />} title="Open Chrome’s ⋮ menu" highlight={platform === 'android'} />
        <Step n={2} icon={<Download />} title="Tap “Install app” or “Add to Home screen”" highlight={platform === 'android'} />
        <Step n={3} icon={<Zap />} title="Long-press the icon for shortcuts" subtitle="Add expense, Snap a receipt, New invoice, Review" highlight={platform === 'android'} />
      </Section>

      <Section title="Mac & PC" footer="Chrome/Edge: install icon in the address bar. Safari on macOS: File → Add to Dock." inset={58}>
        <Step n={1} icon={<Download />} title="Install from the address bar" highlight={platform === 'desktop'} />
      </Section>

      <Section title="What you get" inset={58}>
        <Row wrap icon={<IconTile color="#05A38C"><Smartphone /></IconTile>} title="Full-screen app with its own icon" subtitle="Launch screen in Tech Nerv colours, no browser bars" />
        <Row wrap icon={<IconTile color="#D9467A"><Camera /></IconTile>} title="Camera for receipts" subtitle="Tap + → Snap receipt; photos are compressed before upload" />
        <Row wrap icon={<IconTile color="#0680A2"><RefreshCw /></IconTile>} title="Pull to refresh" subtitle="Drag down from the top of a screen" />
        <Row wrap icon={<IconTile color="#E8833A"><WifiOff /></IconTile>} title="Offline-aware" subtitle="A clear offline screen and banner; nothing financial is stored on the phone" />
        <Row wrap icon={<IconTile color="#7C4DDB"><Zap /></IconTile>} title="Automatic updates" subtitle="You’ll see “A new version is ready → Reload” after an update" />
      </Section>
      <p className="px-4 pb-4 text-footnote text-label-3 lg:px-1">
        Installing needs the app to be served over HTTPS (it will be once it’s hosted). On your home network you can still
        add the local address to your Home Screen to try it.
      </p>
    </>
  );
}

function Step({ n, icon, title, subtitle, highlight }: { n: number; icon: React.ReactNode; title: string; subtitle?: string; highlight?: boolean }) {
  return (
    <Row
      icon={<IconTile color={highlight ? 'var(--accent)' : 'var(--fill-3)'} fg={highlight ? 'var(--on-accent)' : 'var(--label)'}>{icon}</IconTile>}
      title={<><span className="tabular mr-1.5 text-label-3">{n}.</span>{title}</>}
      subtitle={subtitle}
      wrap
    />
  );
}

const DISMISS_KEY = 'tn-install-hint-dismissed';

/** Small card on Home for phone users who haven't installed the app yet. */
export function InstallHint() {
  const standalone = useStandalone();
  const platform = usePlatform();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    // Read after mount so the server render and first client render match.
    let v = false;
    try { v = localStorage.getItem(DISMISS_KEY) === '1'; } catch {}
    const id = requestAnimationFrame(() => setDismissed(v));
    return () => cancelAnimationFrame(id);
  }, []);
  if (standalone || dismissed || platform === 'desktop') return null;
  return (
    <div className="relative mb-6 flex items-center gap-3 rounded-group bg-cell p-3.5 pr-10 shadow-card lg:hidden">
      <IconTile color="var(--accent)" fg="var(--on-accent)" size={40}><Smartphone /></IconTile>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold">Add to your Home Screen</p>
        <p className="text-footnote text-label-2">Full-screen, its own icon, camera-ready. <Link href="/settings/install" className="font-medium text-accent-text">How</Link></p>
      </div>
      <button
        aria-label="Dismiss"
        className="pressable absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-label-3 hover:bg-fill-2"
        onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch {} }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
