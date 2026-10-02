'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

type PageProps = {
  title: string;
  /** Small line under the large title (mobile) / next to the title (desktop). */
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  /** Trailing nav-bar buttons. */
  actions?: ReactNode;
  /** Sticky content under the title: segmented controls, search, filters. */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Use the full content width (tables, dashboards). */
  wide?: boolean;
  className?: string;
};

/**
 * Screen scaffold. Phones get the iOS large-title pattern: the big title scrolls
 * away and a compact title fades into a translucent bar. Desktop gets a slim
 * toolbar with the title and actions inline.
 */
export function Page({ title, subtitle, back, actions, toolbar, children, wide, className }: PageProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e!.isIntersecting), { rootMargin: '-52px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={cn('min-h-dvh', className)}>
      {/* Nav bar */}
      <header
        className={cn(
          'sticky top-0 z-30 transition-[background-color,box-shadow] duration-200',
          collapsed && !toolbar ? 'material-bar hairline-b' : collapsed ? 'material-bar' : 'bg-bg/0',
          'lg:material-bar lg:hairline-b',
        )}
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className={cn('relative mx-auto flex h-[52px] items-center gap-2 px-2 lg:px-8', !wide && 'lg:max-w-[1120px]')}>
          <div className="flex min-w-0 flex-1 items-center lg:flex-none">
            {back && (
              <Link href={back.href} className="pressable -ml-1 flex items-center gap-0.5 rounded-full py-1.5 pr-2 text-accent-text lg:ml-[-6px]">
                <ChevronLeft className="size-[26px] lg:size-5" strokeWidth={2.4} />
                <span className="max-w-[9rem] truncate text-body lg:text-subhead">{back.label}</span>
              </Link>
            )}
          </div>
          {/* compact title: phones once the large title scrolls away; always on desktop */}
          <h1
            className={cn(
              'pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-headline font-semibold transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
              'lg:pointer-events-auto lg:static lg:max-w-none lg:flex-1 lg:translate-x-0 lg:text-title3 lg:font-bold lg:opacity-100',
              back && 'lg:pl-1',
            )}
          >
            {title}
            {subtitle && <span className="ml-2.5 hidden align-baseline text-subhead font-normal text-label-2 lg:inline">{subtitle}</span>}
          </h1>
          <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none lg:gap-2">{actions}</div>
        </div>
      </header>

      {/* Large title (phones) */}
      <div className={cn('mx-auto px-4 pb-2 pt-0.5 lg:hidden')}>
        <h1 className="text-large font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-subhead text-label-2">{subtitle}</p>}
      </div>
      <div ref={sentinel} className="h-px" />

      {toolbar && (
        <div
          className={cn(
            'sticky z-20 transition-[background-color,box-shadow] duration-200',
            'top-[calc(52px+var(--safe-top))] lg:top-[52px]',
            collapsed ? 'material-bar hairline-b' : 'bg-bg',
          )}
        >
          <div className={cn('mx-auto px-4 py-2 lg:px-8 lg:py-3', !wide && 'lg:max-w-[1120px]')}>{toolbar}</div>
        </div>
      )}

      <main className={cn('mx-auto px-4 pb-[calc(var(--tabbar-h)+var(--safe-bottom)+48px)] pt-3 lg:px-8 lg:pb-16 lg:pt-6', !wide && 'lg:max-w-[1120px]')}>
        {children}
      </main>
    </div>
  );
}

