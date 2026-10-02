'use client';
import { createPortal } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { cn } from '@/lib/cn';
import { useIsDesktop } from '@/lib/hooks';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Leading nav button; defaults to Cancel. Pass null to hide. */
  cancelLabel?: string | null;
  /** Trailing action (e.g. Save / Add). */
  action?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Phones: let the sheet take its natural height instead of nearly full screen. */
  fit?: boolean;
  className?: string;
};

const widths = { sm: 'lg:max-w-[420px]', md: 'lg:max-w-[560px]', lg: 'lg:max-w-[720px]', xl: 'lg:max-w-[960px]' };

// Apple's drawer spring: damping ≈ 0.8, response ≈ 0.3s.
const SPRING = { type: 'spring' as const, bounce: 0.18, duration: 0.42 };
const SPRING_CENTER = { type: 'spring' as const, bounce: 0, duration: 0.32 };

/**
 * Bottom sheet on phones (drag down to dismiss, velocity-aware), centered
 * dialog on desktop. Always dims the background — sheets are modal tasks.
 */
export function Sheet({ open, onClose, title, cancelLabel = 'Cancel', action, children, size = 'md', fit, className }: SheetProps) {
  const desktop = useIsDesktop();
  const drag = useDragControls();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    // Project where the flick is heading rather than where the finger let go.
    const projected = info.offset.y + (info.velocity.y / 1000) * 0.998 / (1 - 0.998) * 0.12;
    if (projected > 140 || info.velocity.y > 700) onClose();
  }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-8" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative flex w-full flex-col overflow-hidden bg-bg shadow-pop',
              'rounded-t-[28px] lg:rounded-[20px]',
              fit ? 'max-h-[92dvh]' : 'h-[94dvh] lg:h-auto lg:max-h-[86dvh]',
              widths[size], className,
            )}
            initial={desktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            transition={desktop ? SPRING_CENTER : SPRING}
            drag={desktop ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            onDragEnd={onDragEnd}
          >
            <div
              className="shrink-0 touch-none lg:touch-auto"
              onPointerDown={(e) => !desktop && drag.start(e)}
            >
              <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-label-4 lg:hidden" />
              {(title || action || cancelLabel) && (
                <div className="relative flex h-12 items-center justify-between px-4 lg:h-[52px] lg:px-5">
                  <div className="z-10">
                    {cancelLabel && (
                      <button type="button" onClick={onClose} className="pressable -ml-1 rounded-full px-1 py-1 text-body text-accent-text lg:text-subhead">
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                  {title && <h2 className="absolute inset-x-20 truncate text-center text-headline font-semibold">{title}</h2>}
                  <div className="z-10">{action}</div>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--safe-bottom)+20px)] lg:px-5 lg:pb-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Text button for sheet nav bars ("Save", "Add"). */
export function SheetAction({ children, disabled, loading, form, onClick }: { children: ReactNode; disabled?: boolean; loading?: boolean; form?: string; onClick?: () => void }) {
  return (
    <button
      type={form ? 'submit' : 'button'}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      className="pressable -mr-1 rounded-full px-1 py-1 text-body font-semibold text-accent-text disabled:opacity-40 lg:text-subhead"
    >
      {loading ? 'Saving…' : children}
    </button>
  );
}
