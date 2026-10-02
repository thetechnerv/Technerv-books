'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type Toast = { id: number; title: string; tone?: 'success' | 'error' | 'info'; action?: { label: string; onClick: () => void } };
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export const useToast = () => useContext(Ctx);

/** HUD-style notifications: top of screen on phones, bottom-right on desktop. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++n.current;
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.action ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+8px)] z-[80] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-auto lg:items-end">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              className="material-glass pointer-events-auto flex min-h-[46px] max-w-[min(420px,100%)] items-center gap-2.5 rounded-full py-2 pl-3.5 pr-2 text-subhead font-medium"
            >
              {t.tone === 'error' ? <AlertCircle className="size-5 shrink-0 text-red" /> : t.tone === 'info' ? <Info className="size-5 shrink-0 text-blue" /> : <CheckCircle2 className="size-5 shrink-0 text-accent-text" />}
              <span className="min-w-0 flex-1 pr-1.5">{t.title}</span>
              {t.action && (
                <button onClick={() => { t.action!.onClick(); setItems((xs) => xs.filter((x) => x.id !== t.id)); }} className="pressable shrink-0 rounded-full bg-fill px-3 py-1.5 font-semibold text-accent-text">
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
