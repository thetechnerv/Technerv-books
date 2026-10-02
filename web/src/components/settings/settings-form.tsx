'use client';
import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/fields';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { checkProfileField } from './validate';
import type { ActionResult } from '@/lib/types';

/**
 * The one save pattern every settings screen uses: edit freely, then an
 * explicit Save. Page-level settings: Save in the toolbar on desktop and in a
 * sticky bar above the tab bar on phones (it appears as soon as something
 * changes); ⌘S saves, Discard resets, leaving with unsaved changes asks first.
 * List items (rates, categories, accounts…) edit in a sheet with its own Save.
 */

export type Validator = (value: string, fd: FormData) => string | null;
type Ctx = {
  errors: Record<string, string>;
  validateField: (name: string) => void;
  register: (name: string, fn: Validator) => () => void;
  markDirty: () => void;
};
const FormCtx = createContext<Ctx | null>(null);

export function useSettingsForm() {
  return useContext(FormCtx);
}

function snapshot(form: HTMLFormElement | null) {
  if (!form) return '';
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));
}

/** Inline validation state for one form: per-field validators + a fallback validator. */
function useValidation(form: RefObject<HTMLFormElement | null>, validate: (name: string, value: string, fd: FormData) => string | null, markDirty: () => void) {
  const validators = useRef(new Map<string, Validator>());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const runOne = useCallback((name: string, fd: FormData) => {
    const raw = fd.get(name);
    if (typeof raw !== 'string') return null;
    const own = validators.current.get(name);
    return own ? own(raw, fd) : validate(name, raw, fd);
  }, [validate]);

  const validateField = useCallback((name: string) => {
    if (!form.current) return;
    const err = runOne(name, new FormData(form.current));
    setErrors((e) => {
      if ((e[name] ?? null) === err) return e;
      const next = { ...e };
      if (err) next[name] = err; else delete next[name];
      return next;
    });
  }, [form, runOne]);

  const register = useCallback((name: string, fn: Validator) => {
    validators.current.set(name, fn);
    return () => { validators.current.delete(name); };
  }, []);

  /** Validates every field; returns the first invalid field name or null. */
  const validateAll = useCallback((fd: FormData) => {
    const errs: Record<string, string> = {};
    for (const name of new Set(fd.keys())) {
      const err = runOne(name, fd);
      if (err) errs[name] = err;
    }
    setErrors(errs);
    const first = Object.keys(errs)[0] ?? null;
    if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]:not([type="hidden"])`)?.focus();
    return first;
  }, [form, runOne]);

  const ctx = useMemo<Ctx>(() => ({ errors, validateField, register, markDirty }), [errors, validateField, register, markDirty]);
  return { ctx, validateAll, setErrors };
}

export function SettingsPage({
  title, subtitle, back = { href: '/settings', label: 'Settings' }, action, children, after, validate = profileValidator, saveLabel = 'Save', extraActions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  /** Content below the form (lists with their own sheets, one-off actions). */
  after?: ReactNode;
  /** Validator for any field without its own; defaults to the business-profile rules. */
  validate?: (name: string, value: string, fd: FormData) => string | null;
  saveLabel?: string;
  extraActions?: ReactNode;
}) {
  const formId = `settings-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const form = useRef<HTMLFormElement>(null);
  const initial = useRef('');
  const [dirty, setDirty] = useState(false);
  const [gen, setGen] = useState(0);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const check = useCallback(() => {
    requestAnimationFrame(() => setDirty(snapshot(form.current) !== initial.current));
  }, []);
  const { ctx, validateAll, setErrors } = useValidation(form, validate, check);

  useEffect(() => {
    // Baseline after the first paint so controlled fields have settled.
    const t = requestAnimationFrame(() => { initial.current = snapshot(form.current); setDirty(false); });
    return () => cancelAnimationFrame(t);
  }, [gen]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (e.target !== form.current || pending) return; // ignore submits bubbling from portaled sheets
    const fd = new FormData(form.current);
    if (validateAll(fd)) {
      toast({ title: 'Check the highlighted fields', tone: 'error' });
      return;
    }
    start(async () => {
      const r = await action(fd);
      if (!r.ok) { toast({ title: r.error, tone: 'error' }); return; }
      toast({ title: r.message ?? 'Saved' });
      initial.current = snapshot(form.current);
      setDirty(false);
      router.refresh();
    });
  }

  function discard() {
    setErrors({});
    setGen((g) => g + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  return (
    <>
      <Page
        title={title}
        subtitle={subtitle}
        back={back}
        actions={
          <>
            {extraActions}
            <span className="hidden items-center gap-2 lg:flex">
              {dirty && <Button variant="plain" type="button" onClick={discard}>Discard</Button>}
              <Button variant="filled" type="submit" form={formId} disabled={!dirty} loading={pending}>{saveLabel}</Button>
            </span>
          </>
        }
      >
        <div className="lg:max-w-[720px]">
          <FormCtx.Provider value={ctx}>
            <form id={formId} ref={form} onSubmit={submit} onInput={check} onChange={check} onClick={check} noValidate>
              <Fragment key={gen}>{children}</Fragment>
            </form>
          </FormCtx.Provider>
          {after}
        </div>
      </Page>

      {/* Phone save bar, floating above the tab bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            className="fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden"
            style={{ bottom: 'calc(var(--tabbar-h) + max(var(--safe-bottom), 10px) + 10px)' }}
          >
            <div className="material-glass flex w-full max-w-[440px] items-center gap-1 rounded-full p-1.5 pl-4">
              <span className="flex-1 text-subhead font-medium text-label-2">Unsaved changes</span>
              <button type="button" onClick={discard} className="pressable h-11 rounded-full px-3 text-subhead font-medium text-label-2">Discard</button>
              <Button variant="filled" type="submit" form={formId} loading={pending} className="h-11! rounded-full! px-5!">{saveLabel}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function profileValidator(name: string, value: string, fd: FormData) {
  return checkProfileField(name, value, (n) => {
    const v = fd.get(n);
    return typeof v === 'string' ? v : null;
  });
}

const noValidate = () => null;

/**
 * Create/edit sheet for list items. Header: Cancel · Title · Save. Enter
 * submits, Esc closes. Fields inside get the same inline validation.
 */
export function EditSheet({
  open, onClose, title, action, children, validate = noValidate, saveLabel = 'Save', onSaved, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  validate?: (name: string, value: string, fd: FormData) => string | null;
  saveLabel?: string;
  onSaved?: () => void;
  footer?: ReactNode;
}) {
  const formId = `sheet-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const noop = useCallback(() => {}, []);
  const { ctx, validateAll, setErrors } = useValidation(form, validate, noop);

  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => { setErrors({}); setServerError(null); }, 0);
    return () => clearTimeout(t);
  }, [open, setErrors]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!form.current || pending) return;
    const fd = new FormData(form.current);
    if (validateAll(fd)) return;
    start(async () => {
      const r = await action(fd);
      if (!r.ok) { setServerError(r.error); return; }
      setServerError(null);
      toast({ title: r.message ?? 'Saved' });
      onSaved?.();
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} action={<SheetAction form={formId} loading={pending}>{saveLabel}</SheetAction>}>
      <FormCtx.Provider value={ctx}>
        <form id={formId} ref={form} onSubmit={submit} noValidate className="pt-2">
          {serverError && <p role="alert" className="mb-4 rounded-[12px] bg-red-soft px-4 py-3 text-subhead text-red">{serverError}</p>}
          {children}
          {/* Lets Enter submit from any text field */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </FormCtx.Provider>
      {footer}
    </Sheet>
  );
}

/** Text row wired to the form's inline validation (validates on blur, clears as you fix it). */
export function TextField(props: React.ComponentProps<typeof Input> & { name: string; validate?: Validator }) {
  const ctx = useSettingsForm();
  const { validate, name, onBlur, onChange, ...rest } = props;
  const register = ctx?.register;
  useEffect(() => (validate && register ? register(name, validate) : undefined), [register, name, validate]);
  const error = ctx?.errors[name];
  return (
    <Input
      {...rest}
      name={name}
      error={error}
      aria-invalid={!!error || undefined}
      onBlur={(e) => { ctx?.validateField(name); onBlur?.(e); }}
      onChange={(e) => { if (error) ctx?.validateField(name); onChange?.(e); }}
    />
  );
}

export function SelectField(props: React.ComponentProps<typeof Select> & { name: string }) {
  const ctx = useSettingsForm();
  const error = ctx?.errors[props.name];
  return (
    <>
      <Select {...props} />
      {error && <p className="px-4 pb-2 text-footnote text-red lg:px-3">{error}</p>}
    </>
  );
}

/** Footnote-sized explanatory block inside a section. */
export function Note({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return (
    <div className={tone === 'warn' ? 'bg-orange-soft px-4 py-3 text-footnote text-label lg:px-3' : 'px-4 py-3 text-footnote text-label-2 lg:px-3'}>
      {children}
    </div>
  );
}

/** Open/close state for an EditSheet that keeps its content during the close animation. */
export function useEditor<T extends { id: string }>() {
  const [state, setState] = useState<{ open: boolean; item: T | null; n: number }>({ open: false, item: null, n: 0 });
  return {
    open: state.open,
    item: state.item,
    /** Remount the form for each new edit so defaults reset. */
    key: `${state.item?.id ?? 'new'}-${state.n}`,
    edit: (item: T | null) => setState((s) => ({ open: true, item, n: s.n + 1 })),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}
