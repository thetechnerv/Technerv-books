import { cn } from '@/lib/cn';
import { initials as toInitials } from '@/lib/format';

export function Avatar({ name, color, initials, size = 28, className }: { name: string; color?: string | null; initials?: string | null; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(160deg, color-mix(in srgb, ${color ?? '#9BB1B5'} 85%, white), ${color ?? '#9BB1B5'})`, color: color === '#03DDAA' ? '#032920' : '#fff' }}
    >
      {initials ?? toInitials(name)}
    </span>
  );
}
