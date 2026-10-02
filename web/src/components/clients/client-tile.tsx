import { cn } from '@/lib/cn';

/** Brand-friendly hues (the same family as the sidebar icons). */
const HUES = ['#05A38C', '#0680A2', '#7C4DDB', '#E8833A', '#D9467A', '#5E7CE2', '#03BB90', '#C7861A', '#3E8E9E', '#B4589B'];

export function clientColor(name: string) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export function clientInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

/** Rounded-square initials tile with a deterministic colour per client. */
export function ClientTile({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const c = clientColor(name);
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-[-0.01em] text-white', className)}
      style={{
        width: size, height: size, fontSize: size * 0.38, borderRadius: size * 0.27,
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 78%, white), ${c})`,
      }}
    >
      {clientInitials(name)}
    </span>
  );
}
