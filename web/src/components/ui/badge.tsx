import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'accent' | 'blue' | 'red' | 'orange' | 'purple' | 'gray';
const tones: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent-text',
  blue: 'bg-blue-soft text-blue',
  red: 'bg-red-soft text-red',
  orange: 'bg-orange-soft text-orange',
  purple: 'bg-purple-soft text-purple',
  gray: 'bg-gray-soft text-label-2',
};

export function Badge({ tone = 'gray', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-caption font-semibold tracking-[0.01em] lg:h-5', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  sent: { label: 'Sent', tone: 'blue' },
  partial: { label: 'Partly paid', tone: 'orange' },
  paid: { label: 'Paid', tone: 'accent' },
  void: { label: 'Void', tone: 'gray' },
  accepted: { label: 'Accepted', tone: 'accent' },
  declined: { label: 'Declined', tone: 'red' },
  overdue: { label: 'Overdue', tone: 'red' },
  unreviewed: { label: 'To review', tone: 'orange' },
  matched: { label: 'Matched', tone: 'accent' },
  created: { label: 'Recorded', tone: 'accent' },
  ignored: { label: 'Ignored', tone: 'gray' },
  business: { label: 'Business', tone: 'accent' },
  personal: { label: 'Personal', tone: 'purple' },
  mixed: { label: 'Mixed', tone: 'blue' },
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const s = overdue ? STATUS.overdue! : STATUS[status] ?? { label: status, tone: 'gray' as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
