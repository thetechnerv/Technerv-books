'use client';
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Form rows for grouped sections. Label on the left, control on the right —
 * the iOS Settings / Contacts editing pattern. Put them inside <Section>.
 */
function FieldRow({ label, children, hint, error, stacked, htmlFor }: { label?: ReactNode; children: ReactNode; hint?: ReactNode; error?: string | null; stacked?: boolean; htmlFor?: string }) {
  return (
    <div className={cn('px-4 lg:px-3', stacked ? 'py-2.5' : 'flex min-h-[var(--row-h)] items-center gap-3')}>
      {label && (
        <label htmlFor={htmlFor} className={cn('shrink-0 text-label', stacked ? 'mb-1 block text-footnote font-medium text-label-2' : 'w-[34%] max-w-[160px] lg:w-[140px]')}>
          {label}
        </label>
      )}
      <div className="min-w-0 flex-1">
        {children}
        {error && <p className="pb-2 text-footnote text-red">{error}</p>}
        {hint && !error && <p className="pb-2 text-footnote text-label-3">{hint}</p>}
      </div>
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; trailing?: ReactNode; align?: 'left' | 'right'; stacked?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, trailing, align = 'left', stacked, className, id, name, ...rest }, ref) {
  const fid = id ?? name;
  return (
    <FieldRow label={label} hint={hint} error={error} stacked={stacked} htmlFor={fid}>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          id={fid}
          name={name}
          className={cn('h-[var(--row-h)] w-full min-w-0 bg-transparent outline-none', align === 'right' && 'text-right', stacked && 'h-9', className)}
          {...rest}
        />
        {trailing && <span className="shrink-0 text-label-2">{trailing}</span>}
      </div>
    </FieldRow>
  );
});

export function TextArea({ label, hint, className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <FieldRow label={label} hint={hint} stacked>
      <textarea rows={rows} className={cn('w-full resize-y bg-transparent py-1 outline-none', className)} {...rest} />
    </FieldRow>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; options: { value: string; label: string; group?: string }[]; placeholder?: string };

/** Native select (gets the system picker wheel on iPhone) styled as a value row. */
export function Select({ label, hint, options, placeholder, className, id, name, ...rest }: SelectProps) {
  const fid = id ?? name;
  const groups = [...new Set(options.map((o) => o.group).filter(Boolean))] as string[];
  return (
    <FieldRow label={label} hint={hint} htmlFor={fid}>
      <div className="relative flex items-center">
        <select id={fid} name={name} className={cn('h-[var(--row-h)] w-full min-w-0 cursor-default appearance-none bg-transparent pr-6 text-right text-label-2 outline-none', !label && 'text-left text-label', className)} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {groups.length
            ? groups.map((g) => (
                <optgroup key={g} label={g}>
                  {options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))
            : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-0 size-4 text-label-3" />
      </div>
    </FieldRow>
  );
}

/** iOS switch. Works controlled or uncontrolled; posts "on" in forms. */
export function Toggle({ label, hint, name, checked, defaultChecked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; name?: string; checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  const [inner, setInner] = useState(!!defaultChecked);
  const on = checked ?? inner;
  return (
    <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
      <div className="min-w-0 flex-1 py-2">
        <div>{label}</div>
        {hint && <div className="mt-0.5 text-footnote text-label-2">{hint}</div>}
      </div>
      {name && <input type="hidden" name={name} value={on ? 'on' : ''} />}
      <Switch on={on} disabled={disabled} onChange={(v) => { setInner(v); onChange?.(v); }} />
    </div>
  );
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 lg:h-[22px] lg:w-[38px]', on ? 'bg-accent' : 'bg-fill-3')}
    >
      <span
        className={cn('absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-[250ms] ease-[cubic-bezier(.3,1.3,.6,1)] lg:size-[18px]',
          on ? 'translate-x-[20px] lg:translate-x-[16px]' : 'translate-x-0')}
      />
    </button>
  );
}

/** Big centred amount entry for "add expense / record payment" sheets. */
export function AmountInput({ name, defaultValue, currency = 'CAD', onValue, autoFocus }: { name: string; defaultValue?: string | number; currency?: string; onValue?: (v: number) => void; autoFocus?: boolean }) {
  const [v, setV] = useState(defaultValue !== undefined && defaultValue !== null && defaultValue !== '' ? String(defaultValue) : '');
  return (
    <div className="flex flex-col items-center py-5 lg:py-4">
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-title1 font-semibold text-label-3">{currency === 'USD' ? 'US$' : '$'}</span>
        <input
          name={name}
          value={v}
          autoFocus={autoFocus}
          inputMode="decimal"
          placeholder="0.00"
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1');
            setV(next);
            onValue?.(Number(next || 0));
          }}
          className="tabular w-[min(80vw,9ch)] bg-transparent text-center font-display text-[52px] font-semibold leading-none tracking-[-0.03em] outline-none placeholder:text-label-4 lg:text-[44px]"
          style={{ width: `${Math.max(4, v.length || 4) + 0.5}ch` }}
        />
      </div>
      <span className="mt-1 text-footnote font-medium text-label-3">{currency}</span>
    </div>
  );
}

/** Small pill choice chips (multi- or single-select). */
export function Chips<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn('pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium transition-colors lg:h-7 lg:px-3 lg:text-footnote',
            o.value === value ? 'bg-label text-bg' : 'bg-cell text-label shadow-card')}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
