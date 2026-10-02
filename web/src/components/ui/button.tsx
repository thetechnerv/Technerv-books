'use client';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive' | 'destructive-tinted' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  filled: 'bg-accent text-on-accent font-semibold hover:brightness-[1.04] active:brightness-95',
  tinted: 'bg-accent-soft text-accent-text font-semibold hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
  gray: 'bg-fill text-label font-medium hover:bg-fill-3',
  plain: 'text-accent-text font-medium hover:bg-fill-2',
  destructive: 'bg-red text-white font-semibold',
  'destructive-tinted': 'bg-red-soft text-red font-semibold',
  outline: 'text-label font-medium shadow-[inset_0_0_0_1px_var(--separator-strong)] hover:bg-fill-2',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-subhead gap-1.5 rounded-full',
  md: 'h-10 px-4 text-body gap-2 rounded-md lg:h-8 lg:px-3 lg:rounded-sm lg:text-subhead',
  lg: 'h-[50px] px-5 text-headline gap-2 rounded-[14px] lg:h-10 lg:rounded-md lg:text-body',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
  href?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gray', size = 'md', icon, loading, block, className, children, href, disabled, ...rest },
  ref,
) {
  const cls = cn(
    'pressable inline-flex select-none items-center justify-center whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none',
    variants[variant], sizes[size], block && 'w-full', className,
  );
  const inner = (
    <>
      {loading ? <Loader2 className="size-[1.1em] animate-spin" /> : icon}
      {children}
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {inner}
    </button>
  );
});

/** Round icon-only button used in nav bars and toolbars. */
export function IconButton({ label, className, children, href, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; href?: string }) {
  const cls = cn('pressable inline-flex size-9 items-center justify-center rounded-full text-accent-text hover:bg-fill-2 lg:size-8', className);
  if (href) return <Link href={href} aria-label={label} title={label} className={cls}>{children}</Link>;
  return <button aria-label={label} title={label} className={cls} {...rest}>{children}</button>;
}
