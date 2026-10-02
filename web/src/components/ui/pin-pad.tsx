'use client';
import { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/hooks';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
] as const;

/**
 * iOS-style passcode entry: a row of dots and a round-key number pad.
 * Also accepts the physical keyboard (digits, Backspace) and paste.
 * `shakeKey` changes → the dots shake (wrong PIN).
 */
export function PinPad({ length, value, onChange, onComplete, shakeKey, disabled, label }: {
  length: number; value: string; onChange: (v: string) => void; onComplete?: (v: string) => void;
  shakeKey?: number; disabled?: boolean; label: string;
}) {
  const controls = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (shakeKey === undefined) return;
    haptic([30, 40, 30]);
    controls.start({ x: [0, -14, 12, -9, 6, -3, 0], transition: { duration: 0.42 } });
  }, [shakeKey, controls]);

  function press(d: string) {
    if (disabled || value.length >= length) return;
    const v = value + d;
    haptic(6);
    onChange(v);
    if (v.length === length) onComplete?.(v);
  }
  function back() {
    if (disabled || !value) return;
    onChange(value.slice(0, -1));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    };
    const onPaste = (e: ClipboardEvent) => {
      const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, length);
      if (!digits) return;
      e.preventDefault();
      onChange(digits);
      if (digits.length === length) onComplete?.(digits);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  });

  return (
    <div className="flex flex-col items-center">
      <p className="mb-5 text-headline font-medium" aria-live="polite">{label}</p>
      <motion.div animate={controls} className="mb-9 flex gap-4 lg:mb-7" role="img" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={cn('size-[13px] rounded-full border-[1.5px] border-label transition-colors duration-100', i < value.length && 'bg-label')} />
        ))}
      </motion.div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4 lg:gap-x-5 lg:gap-y-3">
        {KEYS.map(([d, letters]) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled} aria-label={d}>
            <span className="text-[34px] font-normal leading-none tracking-tight lg:text-[28px]">{d}</span>
            <span className="mt-0.5 h-3 text-[10px] font-semibold tracking-[0.18em] text-label-2">{letters}</span>
          </Key>
        ))}
        <span />
        <Key onClick={() => press('0')} disabled={disabled} aria-label="0"><span className="text-[34px] font-normal leading-none lg:text-[28px]">0</span></Key>
        <button type="button" onClick={back} disabled={disabled || !value} aria-label="Delete"
          className="flex size-[78px] items-center justify-center rounded-full text-label transition-opacity disabled:opacity-0 lg:size-[64px]">
          <Delete className="size-7 lg:size-6" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}

function Key({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className="flex size-[78px] select-none flex-col items-center justify-center rounded-full bg-fill transition-[background-color,transform] duration-100 active:scale-95 active:bg-fill-3 disabled:opacity-40 lg:size-[64px]">
      {children}
    </button>
  );
}
