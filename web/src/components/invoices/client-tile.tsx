import { cn } from '@/lib/cn';
import { clientColor } from './shared';

/** Rounded-square initials tile with a stable per-client tint. */
export function ClientTile({ id, name, size = 36, className }: { id: string | null | undefined; name: string | null | undefined; size?: number; className?: string }) {
  const c = clientColor(id);
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center font-semibold text-white', className)}
      style={{
        width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.36, letterSpacing: '0.01em',
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 82%, white), ${c})`,
      }}
    >
      {tileInitials(name)}
    </span>
  );
}

function tileInitials(name: string | null | undefined) {
  const words = (name ?? '').split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?');
}
