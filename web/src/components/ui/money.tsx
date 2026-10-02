import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

/** Tabular currency. `tone` colours positive/negative amounts. */
export function Money({ value, currency = 'CAD', className, tone, compact, sign }: {
  value: number | string | null | undefined; currency?: string | null; className?: string; tone?: 'auto' | 'none'; compact?: boolean; sign?: boolean;
}) {
  const v = Number(value ?? 0);
  return (
    <span className={cn('tabular whitespace-nowrap', tone === 'auto' && v > 0 && 'text-accent-text', tone === 'auto' && v < 0 && 'text-label', className)}>
      {money(v, currency ?? 'CAD', { compact, sign })}
    </span>
  );
}

/** Large hero amount with smaller cents, like Apple Wallet. */
export function BigMoney({ value, currency = 'CAD', className }: { value: number | string | null | undefined; currency?: string; className?: string }) {
  const s = money(value, currency);
  const m = s.match(/^(.*?)([.,]\d{2})$/);
  return (
    <span className={cn('tabular font-display font-semibold tracking-[-0.03em]', className)}>
      {m ? <>{m[1]}<span className="text-[0.6em] tracking-normal text-label-2">{m[2]}</span></> : s}
    </span>
  );
}
