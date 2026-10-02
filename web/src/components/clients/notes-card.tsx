'use client';
import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Section } from '@/components/ui/group';
import { useToast } from '@/components/ui/toast';
import { saveClientNotesAction } from '@/app/(app)/clients/actions';

/** Notes that save themselves when you leave the field (or press ⌘S / ⌘↩). */
export function NotesCard({ clientId, initial }: { clientId: string; initial: string | null }) {
  const toast = useToast();
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [pending, start] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const dirty = value.trim() !== saved.trim();

  function save() {
    if (!dirty) return;
    const next = value;
    start(async () => {
      const res = await saveClientNotesAction(clientId, next);
      if (!res.ok) { toast({ title: res.error, tone: 'error' }); return; }
      setSaved(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    });
  }

  return (
    <Section
      title="Notes"
      action={
        <span className="flex h-4 items-center gap-1 text-caption font-medium text-label-3" aria-live="polite">
          {pending ? <><Loader2 className="size-3 animate-spin" />Saving</> : justSaved ? <><Check className="size-3 text-accent-text" strokeWidth={3} />Saved</> : dirty ? 'Edited' : null}
        </span>
      }
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); } }}
        rows={Math.min(10, Math.max(3, value.split('\n').length + 1))}
        placeholder="Billing contacts, PO rules, how they like to be invoiced…"
        aria-label="Client notes"
        className="block w-full resize-none bg-transparent px-4 py-3 text-body outline-none lg:px-3 lg:py-2.5"
      />
    </Section>
  );
}
