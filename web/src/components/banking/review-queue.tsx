'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import {
  Check, CheckCircle2, ChevronRight, EyeOff, Landmark, PiggyBank, SkipForward, Sparkles, Undo2, Upload, Wand2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, Row } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { date as fmtDate, money, plural, relativeDay } from '@/lib/format';
import { haptic, useIsDesktop } from '@/lib/hooks';
import type { ActionResult } from '@/lib/types';
import {
  createExpenseFromTxn, createPaymentFromTxn, ignoreTransaction, markTransfer, matchTransaction, recordIncomeFromTxn, undoReview,
} from '@/app/(app)/banking/review/actions';
import { createRule } from '@/app/(app)/banking/rules/actions';
import { AccountTile, KindTile, KIND_META, SignedAmount } from './bits';
import { ruleKeyword } from './csv';
import {
  ExpenseSheet, IncomeSheet, PaymentSheet, TransferSheet, defaultExpenseDraft,
  type ExpenseDraft, type IncomeDraft, type PaymentDraft, type TransferDraft,
} from './review-sheets';
import type { MatchSuggestion, ReviewItem, ReviewLookups } from './types';

type SheetKind = 'expense' | 'income' | 'payment' | 'transfer';
type Done = { ids: string[]; label: string };
type RulePrompt = { keyword: string; vendor: string; categoryId: string | null; categoryName: string | null; nature: ExpenseDraft['nature'] };

/** What "accept" (swipe right, M) does for an item. */
function topAction(item: ReviewItem): { label: string; kind: 'match' | 'rule' | 'transfer' | SheetKind; match?: MatchSuggestion } {
  const m = item.matches[0];
  if (m) return { label: 'Match', kind: 'match', match: m };
  if (item.transferTo) return { label: 'Transfer', kind: 'transfer' };
  if (item.amount < 0 && item.rule?.categoryId) return { label: `Add to ${item.rule.categoryName ?? 'expenses'}`, kind: 'rule' };
  if (item.amount < 0) return { label: 'Add expense', kind: 'expense' };
  if (item.clientGuess) return { label: 'Client payment', kind: 'payment' };
  return { label: 'Record income', kind: 'income' };
}

export function ReviewQueue({ items, lookups, me, accountFilter }: { items: ReviewItem[]; lookups: ReviewLookups; me: string; accountFilter: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const [, startRefresh] = useTransition();

  // Keep every item we've seen so undo can put one back before the server catches up.
  const [known, setKnown] = useState<ReviewItem[]>(items);
  const [prevItems, setPrevItems] = useState(items);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [undone, setUndone] = useState<Set<string>>(new Set());
  if (items !== prevItems) {
    setPrevItems(items);
    const byId = new Map(items.map((i) => [i.id, i]));
    const merged = known.map((k) => byId.get(k.id) ?? k);
    for (const i of items) if (!known.some((k) => k.id === i.id)) merged.push(i);
    setKnown(merged);
    if (undone.size) setUndone(new Set([...undone].filter((id) => !byId.has(id))));
  }
  const serverIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const remaining = known.filter((k) => !handled.has(k.id) && (serverIds.has(k.id) || undone.has(k.id)));
  const total = remaining.length + handled.size;

  const [cursor, setCursor] = useState(0);
  const index = Math.min(cursor, Math.max(0, remaining.length - 1));
  const current = remaining[index] ?? null;

  const [history, setHistory] = useState<Done[]>([]);
  const [sheet, setSheet] = useState<{ kind: SheetKind; item: ReviewItem; open: boolean } | null>(null);
  const [rulePrompt, setRulePrompt] = useState<RulePrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const undo = useCallback(async (entry?: Done) => {
    const e = entry ?? history[history.length - 1];
    if (!e) return;
    setHistory((h) => h.filter((x) => x !== e));
    setHandled((s) => { const n = new Set(s); e.ids.forEach((id) => n.delete(id)); return n; });
    setUndone((s) => new Set([...s, ...e.ids]));
    const pos = known.filter((k) => !handled.has(k.id) || e.ids.includes(k.id)).findIndex((k) => k.id === e.ids[0]);
    if (pos >= 0) setCursor(pos);
    setRulePrompt(null);
    const res = await undoReview(e.ids);
    if (!res.ok) toast({ title: res.error, tone: 'error' });
    refresh();
  }, [history, known, handled, toast, refresh]);

  /** Optimistically take the item out of the queue, run the action, offer Undo. */
  const run = useCallback(async <T,>(item: ReviewItem, label: string, fn: () => Promise<ActionResult<T>>, extraIds?: (data: T | undefined) => string[]) => {
    setBusy(true);
    setHandled((s) => new Set([...s, item.id]));
    haptic(10);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setHandled((s) => { const n = new Set(s); n.delete(item.id); return n; });
      toast({ title: res.error, tone: 'error' });
      return res;
    }
    const ids = [item.id, ...(extraIds?.(res.data) ?? [])];
    if (ids.length > 1) setHandled((s) => new Set([...s, ...ids]));
    const entry = { ids, label };
    setHistory((h) => [...h.slice(-19), entry]);
    toast({ title: res.message ?? label, action: { label: 'Undo', onClick: () => undo(entry) } });
    refresh();
    return res;
  }, [toast, refresh, undo]);

  // ───────── actions ─────────
  const doMatch = (item: ReviewItem, m: MatchSuggestion) => run(item, `Matched to ${m.title}`, () => matchTransaction(item.id, m.kind, m.id));
  const doIgnore = (item: ReviewItem) => run(item, 'Ignored', () => ignoreTransaction(item.id));
  const doExpense = async (item: ReviewItem, d: ExpenseDraft) => {
    const res = await run(item, `Added ${d.vendor}`, () => createExpenseFromTxn(item.id, d));
    if (res.ok) {
      const ruleFits = item.rule && item.rule.categoryId === d.categoryId && (item.rule.nature ?? 'business') === d.nature;
      if (!ruleFits && d.categoryId) {
        setRulePrompt({ keyword: ruleKeyword(item.description), vendor: d.vendor, categoryId: d.categoryId, nature: d.nature,
          categoryName: lookups.expenseCategories.find((c) => c.value === d.categoryId)?.label ?? null });
      } else setRulePrompt(null);
    }
    return res.ok ? null : res.error;
  };
  const doIncome = async (item: ReviewItem, d: IncomeDraft) => {
    const res = await run(item, `Recorded ${d.source}`, () => recordIncomeFromTxn(item.id, d));
    return res.ok ? null : res.error;
  };
  const doPayment = async (item: ReviewItem, d: PaymentDraft) => {
    const res = await run(item, 'Payment recorded', () => createPaymentFromTxn(item.id, d));
    return res.ok ? null : res.error;
  };
  const doTransfer = async (item: ReviewItem, d: TransferDraft) => {
    const res = await run(item, 'Marked as a transfer', () => markTransfer(item.id, d), (data) => (data?.pairedId ? [data.pairedId] : []));
    return res.ok ? null : res.error;
  };

  const openSheet = (kind: SheetKind, item: ReviewItem) => setSheet({ kind, item, open: true });
  const closeSheet = () => setSheet((s) => (s ? { ...s, open: false } : s));
  const submitSheet = async <T,>(fn: (item: ReviewItem, d: T) => Promise<string | null>, d: T) => {
    if (!sheet) return null;
    const err = await fn(sheet.item, d);
    if (!err) closeSheet();
    return err;
  };

  const accept = (item: ReviewItem) => {
    const t = topAction(item);
    if (t.kind === 'match' && t.match) return void doMatch(item, t.match);
    if (t.kind === 'rule') return void doExpense(item, defaultExpenseDraft(item, me));
    if (t.kind === 'transfer') return void doTransfer(item, { counterpartAccountId: item.transferTo?.accountId ?? null, note: null });
    openSheet(t.kind as SheetKind, item);
  };

  // ───────── keyboard (desktop) ─────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (!desktop) return;
      if (e.metaKey || e.ctrlKey || e.altKey || sheet?.open) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.key === 'u') { e.preventDefault(); undo(); return; }
      if (!current || busy) return;
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(remaining.length - 1, index + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(0, index - 1)); }
      else if (e.key === 'm') { e.preventDefault(); accept(current); }
      else if (e.key === 'e' && current.amount < 0) { e.preventDefault(); openSheet('expense', current); }
      else if (e.key === 'r' && current.amount > 0) { e.preventDefault(); openSheet('income', current); }
      else if (e.key === 'p' && current.amount > 0) { e.preventDefault(); openSheet('payment', current); }
      else if (e.key === 't') { e.preventDefault(); openSheet('transfer', current); }
      else if (e.key === 'i') { e.preventDefault(); doIgnore(current); }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sheets = sheet && (
    <>
      {sheet.kind === 'expense' && <ExpenseSheet key={sheet.item.id} item={sheet.item} lookups={lookups} me={me} open={sheet.open} onClose={closeSheet} onSubmit={(d) => submitSheet(doExpense, d)} />}
      {sheet.kind === 'income' && <IncomeSheet key={sheet.item.id} item={sheet.item} lookups={lookups} open={sheet.open} onClose={closeSheet} onSubmit={(d) => submitSheet(doIncome, d)} />}
      {sheet.kind === 'payment' && <PaymentSheet key={sheet.item.id} item={sheet.item} lookups={lookups} open={sheet.open} onClose={closeSheet} onSubmit={(d) => submitSheet(doPayment, d)} />}
      {sheet.kind === 'transfer' && <TransferSheet key={sheet.item.id} item={sheet.item} lookups={lookups} open={sheet.open} onClose={closeSheet} onSubmit={(d) => submitSheet(doTransfer, d)} />}
    </>
  );

  const prompt = rulePrompt && <RulePromptCard prompt={rulePrompt} onDismiss={() => setRulePrompt(null)} onDone={refresh} />;

  if (!current) {
    return (
      <>
        {prompt}
        <AllCaughtUp reviewed={handled.size} accountFilter={accountFilter} canUndo={history.length > 0} onUndo={() => undo()} />
        {sheets}
      </>
    );
  }

  const detail = (item: ReviewItem) => (
    <Detail
      item={item} busy={busy}
      onMatch={(m) => doMatch(item, m)}
      onRule={() => doExpense(item, defaultExpenseDraft(item, me))}
      onSheet={(k) => openSheet(k, item)}
      onIgnore={() => doIgnore(item)}
    />
  );

  return (
    <>
      {/* Phones: one card at a time, swipe to decide */}
      <div className="lg:hidden">
        <Progress done={handled.size} total={total} />
        {prompt}
        <SwipeCard
          key={current.id}
          item={current}
          acceptLabel={topAction(current).label}
          onAccept={() => accept(current)}
          onIgnore={() => doIgnore(current)}
        />
        <div className="mt-2 flex items-center justify-between px-1 text-footnote text-label-3">
          <span>Swipe right: {topAction(current).label.toLowerCase()} · left: ignore</span>
          {remaining.length > 1 && (
            <button type="button" onClick={() => setCursor((index + 1) % remaining.length)} className="pressable flex items-center gap-1 rounded-full px-2 py-1 font-medium text-accent-text">
              Skip <SkipForward className="size-3.5" />
            </button>
          )}
        </div>
        <div className="mt-5">{detail(current)}</div>
      </div>

      {/* Desktop: list + detail with keyboard shortcuts */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-6">
        <div>
          <Progress done={handled.size} total={total} />
          <Section inset={56} className="lg:sticky lg:top-[68px]">
            <div className="max-h-[calc(100dvh-220px)] overflow-y-auto group-rows">
              {remaining.map((r, i) => (
                <button
                  key={r.id} type="button" onClick={() => setCursor(i)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === index ? 'bg-accent-soft' : 'hover:bg-fill-2')}
                  aria-current={i === index}
                >
                  <AccountTile kind={r.accountKind} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead font-medium">{r.description}</span>
                    <span className="block truncate text-footnote text-label-2">{fmtDate(r.postedOn, 'MMM d')} · {r.matches[0] ? `Match: ${r.matches[0].title}` : r.transferTo ? `Transfer ${r.amount < 0 ? 'to' : 'from'} ${r.transferTo.accountName}` : r.rule ? `Rule: ${r.rule.vendor}` : r.accountName}</span>
                  </span>
                  <SignedAmount value={r.amount} currency={r.currency} className="text-subhead font-medium" />
                </button>
              ))}
            </div>
          </Section>
          <Shortcuts />
        </div>
        <div>
          {prompt}
          <TxnCard item={current} />
          <div className="mt-5">{detail(current)}</div>
        </div>
      </div>
      {sheets}
    </>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between text-footnote">
        <span className="font-semibold text-label">{Math.min(done + 1, total)} of {total}</span>
        <span className="text-label-3">{total - done} left</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Review progress">
        <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }} />
      </div>
    </div>
  );
}

function TxnCard({ item, className }: { item: ReviewItem; className?: string }) {
  return (
    <div className={cn('rounded-[22px] bg-cell p-5 shadow-card lg:rounded-group', className)}>
      <div className="flex items-center gap-2.5">
        <AccountTile kind={item.accountKind} size={26} />
        <span className="min-w-0 flex-1 truncate text-footnote font-medium text-label-2">{item.accountName}</span>
        <span className="text-footnote text-label-3">{relativeDay(item.postedOn)}</span>
      </div>
      <p className="mt-5 break-words text-title3 font-semibold leading-tight">{item.description}</p>
      <p className="mt-1 text-subhead text-label-2">{item.amount < 0 ? 'Money out' : 'Money in'} · {fmtDate(item.postedOn, 'EEEE, MMM d, yyyy')}</p>
      <div className="mt-6 flex items-end justify-between gap-3">
        <SignedAmount value={item.amount} currency={item.currency} className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] lg:text-[34px]" />
        {item.currency !== 'CAD' && <Badge tone="blue">{item.currency}</Badge>}
      </div>
    </div>
  );
}

/**
 * The phone card. Follows the finger 1:1, tilts a little, and on release
 * projects the flick's momentum: far or fast enough commits, otherwise it
 * springs home. Pulling past the edges rubber-bands.
 */
function SwipeCard({ item, acceptLabel, onAccept, onIgnore }: { item: ReviewItem; acceptLabel: string; onAccept: () => void; onIgnore: () => void }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const rotate = useTransform(x, [-320, 0, 320], reduce ? [0, 0, 0] : [-7, 0, 7]);
  const acceptOpacity = useTransform(x, [20, 110], [0, 1]);
  const ignoreOpacity = useTransform(x, [-110, -20], [1, 0]);
  const [gone, setGone] = useState(false);

  async function onDragEnd(_: unknown, info: PanInfo) {
    const width = ref.current?.offsetWidth ?? 360;
    // Where the card would come to rest if it kept decelerating (iOS-like rate).
    const projected = info.offset.x + (info.velocity.x / 1000) * (0.998 / (1 - 0.998)) * 0.18;
    const dir = projected > width * 0.42 ? 1 : projected < -width * 0.42 ? -1 : 0;
    if (!dir) {
      animate(x, 0, { type: 'spring', bounce: 0.2, duration: 0.45, velocity: info.velocity.x });
      return;
    }
    setGone(true);
    haptic(12);
    await animate(x, dir * (width + 160), reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, duration: 0.35, velocity: info.velocity.x });
    if (dir > 0) onAccept(); else onIgnore();
    // If the action opened a sheet instead of finishing, bring the card back.
    setTimeout(() => { if (ref.current) { setGone(false); animate(x, 0, { type: 'spring', bounce: 0.15, duration: 0.4 }); } }, 400);
  }

  return (
    <div className="relative">
      {/* What lies underneath */}
      <div className="absolute inset-0 flex items-center justify-between overflow-hidden rounded-[22px] px-6" aria-hidden>
        <motion.span style={{ opacity: acceptOpacity }} className="flex items-center gap-2 text-headline font-semibold text-accent-text">
          <Check className="size-6" strokeWidth={2.6} /> {acceptLabel}
        </motion.span>
        <motion.span style={{ opacity: ignoreOpacity }} className="flex items-center gap-2 text-headline font-semibold text-label-2">
          Ignore <EyeOff className="size-5" />
        </motion.span>
      </div>
      <motion.div
        ref={ref}
        style={{ x, rotate }}
        drag={gone ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.42 }}
        className="relative touch-pan-y select-none"
      >
        <TxnCard item={item} className="shadow-pop" />
      </motion.div>
    </div>
  );
}

function Detail({ item, busy, onMatch, onRule, onSheet, onIgnore }: {
  item: ReviewItem; busy: boolean; onMatch: (m: MatchSuggestion) => void; onRule: () => void; onSheet: (k: SheetKind) => void; onIgnore: () => void;
}) {
  const out = item.amount < 0;
  return (
    <>
      {item.matches.length > 0 && (
        <Section title={item.matches.length === 1 ? 'Looks like' : 'Could be'} inset={58}>
          {item.matches.map((m, i) => (
            <div key={m.id} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
              <KindTile kind={m.kind} />
              <div className="min-w-0 flex-1 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{m.title}</span>
                  {i === 0 && m.exact && <Badge tone="accent">Exact</Badge>}
                </div>
                <div className="truncate text-footnote text-label-2">{KIND_META[m.kind].label} · {fmtDate(m.date, 'MMM d')}{m.subtitle ? ` · ${m.subtitle}` : ''}</div>
              </div>
              <span className="tabular text-subhead text-label-2">{money(m.amount, m.currency)}</span>
              <Button size="sm" variant={i === 0 ? 'filled' : 'tinted'} disabled={busy} onClick={() => onMatch(m)}>Match</Button>
            </div>
          ))}
        </Section>
      )}

      {item.transferTo && (
        <Section title="Between your accounts" inset={58}>
          <Row
            icon={<KindTile kind="transfer" />}
            title={`${out ? 'To' : 'From'} ${item.transferTo.accountName}`}
            subtitle="The other side is in the queue too — both are set aside together"
            onClick={() => onSheet('transfer')}
          >
            <ChevronRight className="size-4 shrink-0 text-label-3" />
          </Row>
        </Section>
      )}

      {out && item.rule && (
        <Section title="Rule suggestion" inset={58} footer={<>From your “{item.rule.matchText}” rule. <Link href="/banking/rules" className="font-medium text-accent-text">Edit rules</Link></>}>
          <div className="flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent-text"><Wand2 className="size-4" /></span>
            <div className="min-w-0 flex-1 py-2.5">
              <div className="truncate font-medium">{item.rule.vendor}</div>
              <div className="truncate text-footnote text-label-2">{[item.rule.categoryName, item.rule.nature && item.rule.nature[0]!.toUpperCase() + item.rule.nature.slice(1)].filter(Boolean).join(' · ') || 'Vendor name only'}</div>
            </div>
            <Button size="sm" variant="gray" disabled={busy} onClick={() => onSheet('expense')}>Edit</Button>
            {item.rule.categoryId && <Button size="sm" variant={item.matches.length ? 'tinted' : 'filled'} disabled={busy} onClick={onRule}>Add</Button>}
          </div>
        </Section>
      )}

      <Section title="Or" inset={58}>
        {out ? (
          <ActionRow icon={<KindTile kind="expense" />} title="Create expense" subtitle={item.rule ? 'Pre-filled from the rule' : `As “${item.vendor}”`} k="E" onClick={() => onSheet('expense')} />
        ) : (
          <>
            <ActionRow icon={<KindTile kind="payment" />} title="Client payment" subtitle="Record it and apply to open invoices" k="P" onClick={() => onSheet('payment')} />
            <ActionRow icon={<span className="flex size-[30px] items-center justify-center rounded-[8px] bg-[var(--mint)] text-on-accent"><PiggyBank className="size-[18px]" /></span>} title="Record income" subtitle="Interest, refunds, grants" k="R" onClick={() => onSheet('income')} />
          </>
        )}
        {!item.transferTo && <ActionRow icon={<KindTile kind="transfer" />} title="Transfer" subtitle="Between your own accounts, e.g. paying the card" k="T" onClick={() => onSheet('transfer')} />}
        <ActionRow icon={<span className="flex size-[30px] items-center justify-center rounded-[8px] bg-fill-3 text-label-2"><EyeOff className="size-4" /></span>} title="Ignore" subtitle="Not part of the books" k="I" onClick={onIgnore} />
      </Section>
    </>
  );
}

function ActionRow({ icon, title, subtitle, k, onClick }: { icon: ReactNode; title: string; subtitle: string; k: string; onClick: () => void }) {
  return (
    <Row icon={icon} title={title} subtitle={subtitle} onClick={onClick}>
      <kbd className="hidden rounded-[5px] bg-fill px-1.5 py-0.5 font-sans text-caption font-semibold text-label-2 lg:inline">{k}</kbd>
    </Row>
  );
}

function Shortcuts() {
  const keys: [string, string][] = [['J / K', 'Next / previous'], ['M', 'Accept suggestion'], ['E', 'Create expense'], ['P / R', 'Payment / income'], ['T', 'Transfer'], ['I', 'Ignore'], ['U', 'Undo']];
  return (
    <div className="mt-[-12px] px-1 text-caption text-label-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {keys.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2"><kbd className="min-w-[38px] rounded-[5px] bg-fill px-1.5 py-0.5 text-center font-sans font-semibold text-label-2">{k}</kbd>{v}</div>
        ))}
      </div>
    </div>
  );
}

function RulePromptCard({ prompt, onDismiss, onDone }: { prompt: RulePrompt; onDismiss: () => void; onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const res = await createRule({ matchText: prompt.keyword, vendorRename: prompt.vendor, categoryId: prompt.categoryId, nature: prompt.nature, applyToUnreviewed: true });
    setSaving(false);
    if (!res.ok) { toast({ title: res.error, tone: 'error' }); return; }
    toast({ title: res.data?.applied ? `Rule saved · ${plural(res.data.applied, 'suggestion')} updated` : 'Rule saved' });
    onDismiss();
    onDone();
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
      className="mb-4 flex items-start gap-3 rounded-group bg-accent-soft p-3.5"
    >
      <Sparkles className="mt-0.5 size-5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold">Always do this for “{prompt.keyword.length > 18 ? prompt.keyword.slice(0, 18) + '…' : prompt.keyword}…”?</p>
        <p className="mt-0.5 text-footnote text-label-2">Next time, suggest {prompt.vendor}{prompt.categoryName ? ` · ${prompt.categoryName}` : ''} · {prompt.nature}.</p>
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant="filled" loading={saving} onClick={save}>Create rule</Button>
          <Button size="sm" variant="plain" onClick={onDismiss}>Not now</Button>
        </div>
      </div>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="pressable -m-1 rounded-full p-1 text-label-3"><X className="size-4" /></button>
    </motion.div>
  );
}

function AllCaughtUp({ reviewed, accountFilter, canUndo, onUndo }: { reviewed: number; accountFilter: string | null; canUndo: boolean; onUndo: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.15, duration: 0.6 }}
      className="flex flex-col items-center px-6 py-16 text-center"
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.7, delay: 0.08 }}
        className="mb-5 flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent-text"
      >
        <CheckCircle2 className="size-10" strokeWidth={1.8} />
      </motion.span>
      <h2 className="text-title2 font-bold">All caught up</h2>
      <p className="mt-1.5 max-w-sm text-subhead text-label-2">
        {reviewed > 0 ? `${plural(reviewed, 'transaction')} sorted. ` : ''}
        Every {accountFilter ? 'transaction in this account' : 'bank and card transaction'} is matched, recorded or set aside.
        Import next month’s statement when it’s ready.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button href={accountFilter ? `/banking/import?account=${accountFilter}` : '/banking/import'} variant="tinted" icon={<Upload className="size-4" />}>Import statement</Button>
        <Button href="/banking" variant="gray" icon={<Landmark className="size-4" />}>Accounts</Button>
        {canUndo && <Button variant="plain" onClick={onUndo} icon={<Undo2 className="size-4" />}>Undo last</Button>}
      </div>
    </motion.div>
  );
}

