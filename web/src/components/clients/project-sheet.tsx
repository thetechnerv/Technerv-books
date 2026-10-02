'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { Section } from '@/components/ui/group';
import { Input, TextArea } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { isoToday } from '@/lib/format';
import type { Row } from '@/lib/types';
import { createProjectAction, deleteProjectAction, updateProjectAction } from '@/app/(app)/clients/actions';
import { validateProject, type FieldErrors, type ProjectInput } from './validate';

export const PROJECT_STATUS: { value: ProjectInput['status']; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
];

function initial(p?: Row<'projects'> | null): ProjectInput {
  return {
    name: p?.name ?? '',
    status: (p?.status as ProjectInput['status']) ?? 'active',
    budget: p?.budget !== null && p?.budget !== undefined ? String(Number(p.budget)) : '',
    started_on: p?.started_on ?? (p ? '' : isoToday()),
    ended_on: p?.ended_on ?? '',
    notes: p?.notes ?? '',
  };
}

/** Create / edit a project. The form remounts (via `key`) between projects. */
export function ProjectSheet({ open, onClose, clientId, currency, project, onCreated }: {
  open: boolean; onClose: () => void; clientId: string; currency: string; project?: Row<'projects'> | null; onCreated?: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);
  // Fresh form every time the sheet opens (state adjusted during render, not in an effect).
  const [prevOpen, setPrevOpen] = useState(open);
  const [nonce, setNonce] = useState(0);
  if (open !== prevOpen) { setPrevOpen(open); if (open) setNonce((n) => n + 1); }
  const formId = project ? `project-${project.id}` : 'project-new';
  return (
    <Sheet open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} size="sm" fit
      action={<SheetAction form={formId} loading={pending}>{project ? 'Save' : 'Add'}</SheetAction>}>
      <ProjectForm key={`${project?.id ?? 'new'}-${nonce}`} formId={formId} clientId={clientId} currency={currency} project={project} onClose={onClose} onCreated={onCreated} onPending={setPending} />
    </Sheet>
  );
}

function ProjectForm({ formId, clientId, currency, project, onClose, onCreated, onPending: setPending }: {
  formId: string; clientId: string; currency: string; project?: Row<'projects'> | null; onClose: () => void; onCreated?: (id: string) => void; onPending: (p: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useState<ProjectInput>(() => initial(project));
  const [errors, setErrors] = useState<FieldErrors<ProjectInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [, start] = useTransition();

  const set = <K extends keyof ProjectInput>(k: K, value: ProjectInput[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateProject(v);
    setErrors(errs);
    setFormError(null);
    if (Object.values(errs).some(Boolean)) return;
    setPending(true);
    start(async () => {
      const res = project ? await updateProjectAction(project.id, v) : await createProjectAction(clientId, v);
      setPending(false);
      if (!res.ok) { setFormError(res.error); return; }
      toast({ title: project ? 'Project saved' : 'Project added' });
      onClose();
      router.refresh();
      if (!project && res.data) onCreated?.((res.data as { id: string }).id);
    });
  }

  async function remove() {
    if (!project) return;
    const ok = await confirm({ title: `Delete “${project.name}”?`, message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    startDelete(async () => {
      const res = await deleteProjectAction(project.id);
      if (!res.ok) { setFormError(res.error); return; }
      toast({ title: 'Project deleted' });
      onClose();
      router.push(`/clients/${clientId}`);
      router.refresh();
    });
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="pt-2">
      {formError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-group bg-red-soft px-4 py-3 text-subhead text-red">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {formError}
        </div>
      )}
      <Section>
        <Input label="Name" name="name" placeholder="After-hours voice line" autoFocus={!project} value={v.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Budget" name="budget" inputMode="decimal" placeholder="Optional" align="right" trailing={currency} value={v.budget} error={errors.budget}
          onChange={(e) => set('budget', e.target.value.replace(/[^\d.,]/g, ''))} hint={v.budget ? 'Before tax' : undefined} />
      </Section>
      <Section title="Status">
        <div className="p-2">
          <Segmented full options={PROJECT_STATUS} value={v.status} onChange={(s) => set('status', s)} />
        </div>
      </Section>
      <Section title="Dates">
        <Input label="Start" name="started_on" type="date" align="right" value={v.started_on} onChange={(e) => set('started_on', e.target.value)} />
        <Input label="End" name="ended_on" type="date" align="right" value={v.ended_on} error={errors.ended_on} onChange={(e) => set('ended_on', e.target.value)} />
      </Section>
      <Section title="Notes">
        <TextArea name="notes" rows={3} placeholder="Scope, milestones, links…" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Section>
      {project && (
        <Button type="button" variant="destructive-tinted" block onClick={remove} loading={deleting} icon={<Trash2 className="size-4" />} className="mb-2">
          Delete project
        </Button>
      )}
      <button type="submit" hidden aria-hidden tabIndex={-1} />
    </form>
  );
}
