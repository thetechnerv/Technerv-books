'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FlaskConical, Plus, RefreshCw, Search, Wand2 } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useDebounced } from '@/lib/hooks';
import { date as fmtDate, plural } from '@/lib/format';
import type { ExpenseNature } from '@/lib/types';
import { applyRulesToUnreviewed, createRule, deleteRule, testRule, updateRule } from '@/app/(app)/banking/rules/actions';
import { SignedAmount } from './bits';
import type { Option } from './types';

export type RuleRow = {
  id: string; matchText: string; vendor: string | null; categoryId: string | null; categoryName: string | null;
  nature: ExpenseNature | null; priority: number; timesApplied: number; waiting: number;
};

type Draft = { id: string | null; matchText: string; vendor: string; categoryId: string; nature: ExpenseNature | 'any'; priority: string };
const blank = (matchText = ''): Draft => ({ id: null, matchText, vendor: '', categoryId: '', nature: 'business', priority: '0' });

export function RulesManager({ rules, categories, startNew }: { rules: RuleRow[]; categories: Option[]; startNew: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(startNew !== null ? blank(startNew) : null);
  const [open, setOpen] = useState(startNew !== null);
  const [q, setQ] = useState('');
  const [applying, setApplying] = useState(false);

  const edit = (r: RuleRow) => {
    setDraft({ id: r.id, matchText: r.matchText, vendor: r.vendor ?? '', categoryId: r.categoryId ?? '', nature: r.nature ?? 'any', priority: String(r.priority) });
    setOpen(true);
  };
  async function apply() {
    setApplying(true);
    const res = await applyRulesToUnreviewed();
    setApplying(false);
    toast(res.ok ? { title: res.message ?? 'Rules applied' } : { title: res.error, tone: 'error' });
    router.refresh();
  }
  const shown = rules.filter((r) => !q || `${r.matchText} ${r.vendor ?? ''} ${r.categoryName ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules" aria-label="Search rules"
            className="h-9 w-full rounded-[10px] bg-fill pl-8 pr-3 outline-none placeholder:text-label-3 lg:h-7 lg:rounded-[7px] lg:text-subhead" />
        </div>
        <Button variant="gray" size="sm" loading={applying} onClick={apply} icon={<RefreshCw className="size-3.5" />}>Apply to unreviewed</Button>
        <Button variant="filled" size="sm" onClick={() => { setDraft(blank()); setOpen(true); }} icon={<Plus className="size-4" />}>New rule</Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState icon={<Wand2 />} title="No rules yet" message="Rules fill in the vendor, category and business/personal for bank rows whose description contains some text — like “OPENAI” → OpenAI · Cloud." action={<Button variant="tinted" onClick={() => { setDraft(blank()); setOpen(true); }}>Create a rule</Button>} />
      ) : (
        <Section title={plural(shown.length, 'rule')} inset={16} footer="Matching ignores upper/lower case. When several rules match, the higher priority wins, then the longer text.">
          {shown.map((r) => (
            <Row key={r.id} onClick={() => edit(r)}
              title={<span className="flex items-center gap-2"><code className="truncate rounded-[5px] bg-fill px-1.5 py-0.5 font-mono text-footnote font-semibold">{r.matchText}</code><span className="text-label-3">→</span><span className="truncate font-medium">{r.vendor ?? 'Same name'}</span></span>}
              subtitle={[r.categoryName ?? 'No category', r.priority ? `priority ${r.priority}` : null, r.waiting ? `${r.waiting} waiting for review` : null].filter(Boolean).join(' · ')}
            >
              <span className="flex shrink-0 flex-col items-end gap-1">
                {r.nature ? <StatusBadge status={r.nature} /> : <Badge>Any</Badge>}
                <span className="tabular text-caption text-label-3">used {r.timesApplied}×</span>
              </span>
            </Row>
          ))}
          {shown.length === 0 && <p className="px-4 py-6 text-center text-subhead text-label-2">No rules match “{q}”.</p>}
        </Section>
      )}

      {draft && <RuleSheet key={draft.id ?? 'new'} draft={draft} categories={categories} open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

function RuleSheet({ draft, categories, open, onClose, onSaved }: { draft: Draft; categories: Option[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ total: number; unreviewed: number; examples: { description: string; amount: number; posted_on: string; status: string }[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const text = useDebounced(d.matchText.trim(), 350);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Live "Test": how many imported transactions this text would catch.
  useEffect(() => {
    let live = true;
    if (text.length < 3) return;
    testRule(text).then((res) => { if (live) setTest(res.ok ? res.data! : null); });
    return () => { live = false; };
  }, [text]);

  async function runTest() {
    if (d.matchText.trim().length < 3) return setError('Type at least 3 characters to test.');
    setTesting(true);
    const res = await testRule(d.matchText.trim());
    setTesting(false);
    if (res.ok) setTest(res.data!); else setError(res.error);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    const input = { matchText: d.matchText, vendorRename: d.vendor || null, categoryId: d.categoryId || null, nature: d.nature === 'any' ? null : d.nature, priority: Number(d.priority) || 0 };
    const res = d.id ? await updateRule(d.id, input) : await createRule({ ...input, applyToUnreviewed: true });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast({ title: res.message ?? 'Saved' });
    onSaved();
  }
  async function remove() {
    if (!d.id) return;
    const ok = await confirm({ title: `Delete the “${d.matchText}” rule?`, message: 'Expenses already created stay as they are. Suggestions waiting in the review queue are removed.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const res = await deleteRule(d.id);
    toast(res.ok ? { title: res.message ?? 'Deleted' } : { title: res.error, tone: 'error' });
    if (res.ok) onSaved();
  }

  const showTest = test && d.matchText.trim().length >= 3;
  return (
    <Sheet open={open} onClose={onClose} title={d.id ? 'Edit rule' : 'New rule'} action={<SheetAction form="rule-form" loading={busy}>Save</SheetAction>}>
      <form id="rule-form" onSubmit={submit} className="pt-2">
        {error && <p role="alert" className="mb-4 rounded-md bg-red-soft px-3 py-2 text-footnote text-red">{error}</p>}
        <Section title="When the description contains" footer="Use the part that’s always there, e.g. “LINKEDIN” rather than “LINKEDIN PREMIUM 8841”.">
          <Input name="matchText" placeholder="e.g. LINKEDIN" value={d.matchText} autoFocus={!d.id} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            onChange={(e) => set('matchText', e.target.value.toUpperCase())} className="font-mono" />
        </Section>
        <Section title="Fill in">
          <Input label="Vendor" name="vendor" placeholder="Same as bank" value={d.vendor} onChange={(e) => set('vendor', e.target.value)} align="right" autoComplete="off" />
          <Select label="Category" name="category" value={d.categoryId} placeholder="None" options={categories} onChange={(e) => set('categoryId', e.target.value)} />
          <div className="p-2">
            <Segmented full value={d.nature} onChange={(v) => set('nature', v)} options={[{ value: 'business', label: 'Business' }, { value: 'mixed', label: 'Mixed' }, { value: 'personal', label: 'Personal' }, { value: 'any', label: 'Don’t set' }]} />
          </div>
          <Input label="Priority" name="priority" inputMode="numeric" value={d.priority} onChange={(e) => set('priority', e.target.value.replace(/[^\d-]/g, ''))} align="right" hint="Higher wins when two rules match. Usually 0." />
        </Section>

        <Section title="Test" action={<button type="button" onClick={runTest} className="flex items-center gap-1 text-footnote font-medium text-accent-text"><FlaskConical className="size-3.5" />{testing ? 'Testing…' : 'Run test'}</button>}>
          {!showTest ? (
            <p className="px-4 py-4 text-subhead text-label-2 lg:px-3">Type at least 3 characters to see which transactions match.</p>
          ) : (
            <>
              <div className="px-4 py-3 lg:px-3">
                <p className="font-semibold">{test.total ? `Matches ${plural(test.total, 'transaction')}` : 'No imported transactions match yet'}</p>
                {test.total > 0 && <p className="text-footnote text-label-2">{test.unreviewed ? `${test.unreviewed} waiting for review will get this suggestion` : 'None are waiting for review'}</p>}
              </div>
              {test.examples.map((x, i) => (
                <Row key={i} title={<span className="font-mono text-footnote">{x.description}</span>} subtitle={fmtDate(x.posted_on)}>
                  <span className="flex shrink-0 flex-col items-end gap-0.5"><SignedAmount value={x.amount} className="text-subhead" /><StatusBadge status={x.status} /></span>
                </Row>
              ))}
            </>
          )}
        </Section>

        {d.id && <Button type="button" variant="destructive-tinted" size="lg" block onClick={remove} className="mb-4">Delete rule</Button>}
      </form>
    </Sheet>
  );
}
