'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';

export type MenuItem = { label: string; icon?: ReactNode; onSelect?: () => void; href?: string; destructive?: boolean; disabled?: boolean; external?: boolean } | 'separator';

/** Pull-down menu that grows out of its trigger (iOS context-menu style). */
export function Menu({ trigger, items, align = 'end', label = 'More' }: { trigger: ReactNode; items: MenuItem[]; align?: 'start' | 'end'; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} className="inline-flex">{trigger}</span>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)', transition: { duration: 0.14 } }}
            transition={{ type: 'spring', bounce: 0.18, duration: 0.34 }}
            style={{ transformOrigin: align === 'end' ? 'top right' : 'top left' }}
            className={cn('material-thick absolute top-[calc(100%+6px)] z-50 min-w-[230px] overflow-hidden rounded-[14px] py-1 shadow-pop lg:min-w-[200px] lg:rounded-[10px]', align === 'end' ? 'right-0' : 'left-0')}
          >
            {items.map((it, i) =>
              it === 'separator' ? (
                <div key={i} className="my-1 h-[6px] bg-fill-2 lg:h-px lg:bg-separator" />
              ) : it.href ? (
                <Link key={i} href={it.href} target={it.external ? '_blank' : undefined} onClick={() => setOpen(false)} className={itemCls(it)}>
                  <span className="flex-1">{it.label}</span>{it.icon}
                </Link>
              ) : (
                <button key={i} type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect?.(); }} className={itemCls(it)}>
                  <span className="flex-1 text-left">{it.label}</span>{it.icon}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const itemCls = (it: { destructive?: boolean; disabled?: boolean }) =>
  cn('flex h-11 w-full items-center gap-3 px-4 text-body hover:bg-fill-2 active:bg-fill disabled:opacity-40 lg:h-8 lg:px-3 lg:text-subhead [&_svg]:size-[18px] lg:[&_svg]:size-4',
    it.destructive ? 'text-red' : 'text-label');
