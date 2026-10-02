'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Copy, Mail, MapPin, Phone } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

const subscribe = () => () => {};
const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

/** iOS Contacts-style action tiles: Call · Email · Copy address · Maps. */
export function ContactActions({ phone, email, cc, address, subject }: { phone: string | null; email: string | null; cc: string[]; address: string[]; subject?: string }) {
  const toast = useToast();
  const apple = useSyncExternalStore(subscribe, isApple, () => false);
  const oneLine = address.join(', ');
  const mapsHref = oneLine
    ? apple ? `https://maps.apple.com/?q=${encodeURIComponent(oneLine)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(oneLine)}`
    : undefined;
  const mailParams = new URLSearchParams();
  if (cc.length) mailParams.set('cc', cc.join(','));
  if (subject) mailParams.set('subject', subject);
  const mailHref = email ? `mailto:${email}${mailParams.size ? `?${mailParams.toString().replace(/\+/g, '%20')}` : ''}` : undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address.join('\n'));
      toast({ title: 'Address copied' });
    } catch {
      toast({ title: 'Couldn’t copy — select the address instead', tone: 'error' });
    }
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      <Action href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined} icon={<Phone />} label="Call" title={phone ?? 'No phone number'} />
      <Action href={mailHref} icon={<Mail />} label="Email" title={email ?? 'No email address'} />
      <Action onClick={oneLine ? copy : undefined} icon={<Copy />} label="Copy address" short="Copy" title={oneLine || 'No address'} />
      <Action href={mapsHref} external icon={<MapPin />} label="Open in Maps" short="Maps" title={oneLine || 'No address'} />
    </div>
  );
}

function Action({ href, onClick, icon, label, short, title, external }: { href?: string; onClick?: () => void; icon: ReactNode; label: string; short?: string; title: string; external?: boolean }) {
  const disabled = !href && !onClick;
  const cls = cn(
    'pressable flex h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] bg-accent-soft text-accent-text lg:h-[50px] lg:rounded-[10px]',
    '[&_svg]:size-[19px] [&_svg]:stroke-[2.1] lg:[&_svg]:size-[17px]',
    disabled ? 'pointer-events-none bg-fill-2 text-label-3' : 'hover:brightness-[0.98]',
  );
  const inner = (
    <>
      {icon}
      <span className="text-caption font-semibold">
        <span className="lg:hidden">{short ?? label}</span>
        <span className="hidden lg:inline">{label}</span>
      </span>
    </>
  );
  if (disabled) return <span className={cls} aria-disabled title={title}>{inner}</span>;
  if (href) return <a href={href} className={cls} title={title} aria-label={`${label}: ${title}`} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} title={title} aria-label={`${label}: ${title}`}>{inner}</button>;
}
