import { CreditCard, Landmark, Receipt, HandCoins, ArrowLeftRight, PiggyBank, type LucideIcon } from 'lucide-react';
import { IconTile } from '@/components/ui/group';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import type { MatchKind } from './types';

export function AccountTile({ kind, color, size = 30 }: { kind: string; color?: string | null; size?: number }) {
  const Icon = kind === 'credit_card' ? CreditCard : Landmark;
  return <IconTile color={color ?? 'var(--ocean)'} size={size}><Icon strokeWidth={2.1} /></IconTile>;
}

export const KIND_META: Record<MatchKind, { label: string; icon: LucideIcon; color: string }> = {
  expense: { label: 'Expense', icon: Receipt, color: 'var(--chart-out)' },
  payment: { label: 'Client payment', icon: HandCoins, color: 'var(--teal)' },
  transfer: { label: 'Owner transfer', icon: ArrowLeftRight, color: 'var(--ocean)' },
  income: { label: 'Income', icon: PiggyBank, color: 'var(--mint)' },
};

export function KindTile({ kind, size = 30 }: { kind: MatchKind; size?: number }) {
  const m = KIND_META[kind];
  return <IconTile color={m.color} size={size} fg={kind === 'income' ? 'var(--on-accent)' : undefined}><m.icon strokeWidth={2.1} /></IconTile>;
}

/** Bank amount: money in is green with a plus, money out plain with a minus. */
export function SignedAmount({ value, currency = 'CAD', className }: { value: number; currency?: string; className?: string }) {
  return (
    <span className={cn('tabular whitespace-nowrap', value > 0 ? 'text-accent-text' : 'text-label', className)}>
      {money(value, currency, { sign: true })}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = { unreviewed: 'To review', matched: 'Matched', created: 'Recorded', ignored: 'Ignored' };
