'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export const PALETTE = ['#03DDAA', '#05A38C', '#0680A2', '#5E7CE2', '#7C4DDB', '#D9467A', '#E0352B', '#E8833A', '#E5A00D', '#5B6B70', '#9BB1B5', '#0C1113'];

/** Row of colour dots; posts the chosen hex under `name`. */
export function Swatches({ name, defaultValue, label = 'Colour', allowNone }: { name: string; defaultValue?: string | null; label?: string; allowNone?: boolean }) {
  const [value, setValue] = useState(defaultValue ?? (allowNone ? '' : PALETTE[0]!));
  return (
    <div className="px-4 py-3 lg:px-3">
      <div className="mb-2 text-footnote font-medium text-label-2">{label}</div>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={label}>
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={value === ''}
            aria-label="Automatic"
            onClick={() => setValue('')}
            className={cn('pressable flex size-8 items-center justify-center rounded-full bg-fill text-caption2 font-semibold text-label-2', value === '' && 'shadow-[0_0_0_2px_var(--bg-cell),0_0_0_4px_var(--label-3)]')}
          >
            Auto
          </button>
        )}
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toUpperCase() === c}
            aria-label={c}
            onClick={() => setValue(c)}
            className={cn('pressable flex size-8 items-center justify-center rounded-full', value.toUpperCase() === c && 'shadow-[0_0_0_2px_var(--bg-cell),0_0_0_4px_var(--label-3)]')}
            style={{ background: c }}
          >
            {value.toUpperCase() === c && <Check className="size-4" style={{ color: c === '#03DDAA' || c === '#9BB1B5' ? '#032920' : '#fff' }} strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}
