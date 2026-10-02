'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';

type Opts = { title: string; message?: string; confirmLabel?: string; destructive?: boolean };
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);

/** Alert-style confirmation. Reserve for destructive or irreversible actions. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(Opts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: Opts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {state && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-8">
              <motion.div className="absolute inset-0 bg-[var(--scrim)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(false)} />
              <motion.div
                role="alertdialog"
                initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
                className="material-thick relative w-full max-w-[280px] overflow-hidden rounded-[16px] text-center shadow-pop lg:max-w-[320px]"
              >
                <div className="px-5 pb-4 pt-5">
                  <p className="text-headline font-semibold">{state.title}</p>
                  {state.message && <p className="mt-1 text-footnote text-label-2">{state.message}</p>}
                </div>
                <div className="grid grid-cols-2 hairline-t">
                  <button className="h-11 text-body text-accent-text active:bg-fill-2" onClick={() => done(false)}>Cancel</button>
                  <button className={`h-11 border-l-[0.5px] border-separator text-body font-semibold active:bg-fill-2 ${state.destructive ? 'text-red' : 'text-accent-text'}`} onClick={() => done(true)}>
                    {state.confirmLabel ?? 'OK'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
