import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** iOS inset-grouped section: optional header, rounded card of rows, optional footer. */
export function Section({ title, footer, action, children, className, inset = 16, flush }: {
  title?: ReactNode; footer?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; inset?: number; flush?: boolean;
}) {
  return (
    <section className={cn('mb-7 lg:mb-6', className)}>
      {(title || action) && (
        <div className="mb-1.5 flex items-end justify-between px-4 lg:px-1">
          {title && <h2 className="text-footnote font-medium uppercase tracking-[0.04em] text-label-2 lg:text-caption">{title}</h2>}
          {action}
        </div>
      )}
      <div
        className={cn('group-rows overflow-hidden bg-cell shadow-card', flush ? '' : 'rounded-group')}
        style={{ ['--row-inset' as string]: `${inset}px` }}
      >
        {children}
      </div>
      {footer && <p className="mt-1.5 px-4 text-footnote text-label-2 lg:px-1">{footer}</p>}
    </section>
  );
}

type RowProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;      // trailing small text under value
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
  children?: ReactNode;    // custom trailing content
  wrap?: boolean;          // let title/subtitle wrap instead of truncating
};

/** A list row. Becomes a link or button when href / onClick is set. */
export function Row({ icon, title, subtitle, value, detail, href, onClick, chevron, destructive, className, children, wrap }: RowProps) {
  const interactive = !!(href || onClick);
  const content = (
    <>
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 flex-1 py-[11px] lg:py-2">
        <span className={cn('block', !wrap && 'truncate', destructive ? 'text-red' : 'text-label')}>{title}</span>
        {subtitle && <span className={cn('mt-0.5 block text-subhead text-label-2', !wrap && 'truncate')}>{subtitle}</span>}
      </span>
      {(value || detail) && (
        <span className="flex shrink-0 flex-col items-end text-right">
          {value && <span className="tabular text-label-2">{value}</span>}
          {detail && <span className="tabular mt-0.5 text-footnote text-label-3">{detail}</span>}
        </span>
      )}
      {children}
      {(chevron ?? interactive) && href && <ChevronRight className="size-4 shrink-0 text-label-3" strokeWidth={2.5} />}
    </>
  );
  const cls = cn('flex min-h-[var(--row-h)] w-full items-center gap-3 px-4 text-left lg:px-3', interactive && 'row-press cursor-default', className);
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <div className={cls}>{content}</div>;
}

/** Rounded-square symbol tile, like the icons in iOS Settings. */
export function IconTile({ children, color = 'var(--accent)', fg = '#fff', size = 30 }: { children: ReactNode; color?: string; fg?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[8px] lg:rounded-[6px] [&_svg]:size-[60%]"
      style={{ background: color, color: fg, width: size, height: size }}
    >
      {children}
    </span>
  );
}

/** Plain card surface for dashboards. */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn('rounded-group bg-cell shadow-card', padded && 'p-4 lg:p-4', className)}>{children}</div>;
}
