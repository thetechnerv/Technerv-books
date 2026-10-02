'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Ellipsis, FileText, Pencil, ClipboardList } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import type { Row } from '@/lib/types';
import { setProjectStatusAction } from '@/app/(app)/clients/actions';
import { ProjectSheet, PROJECT_STATUS } from './project-sheet';

export function ProjectNavActions({ project, clientId, currency }: { project: Row<'projects'>; clientId: string; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  function setStatus(status: (typeof PROJECT_STATUS)[number]['value']) {
    const prev = project.status as typeof status;
    if (status === prev) return;
    start(async () => {
      const res = await setProjectStatusAction(project.id, status);
      if (!res.ok) { toast({ title: res.error, tone: 'error' }); return; }
      router.refresh();
      toast({
        title: `Marked ${PROJECT_STATUS.find((s) => s.value === status)!.label.toLowerCase()}`,
        action: { label: 'Undo', onClick: () => start(async () => { await setProjectStatusAction(project.id, prev); router.refresh(); }) },
      });
    });
  }

  const items: MenuItem[] = [
    { label: 'New invoice', icon: <FileText />, href: `/invoices/new?client=${clientId}&project=${project.id}` },
    { label: 'New estimate', icon: <ClipboardList />, href: `/invoices/new?kind=estimate&client=${clientId}&project=${project.id}` },
    'separator',
    ...PROJECT_STATUS.map((s) => ({
      label: s.value === project.status ? s.label : `Mark ${s.label.toLowerCase()}`,
      icon: s.value === project.status ? <Check strokeWidth={2.4} className="text-accent-text" /> : undefined,
      onSelect: () => setStatus(s.value),
    })),
    'separator',
    { label: 'Edit project', icon: <Pencil />, onSelect: () => setEditing(true) },
  ];

  return (
    <>
      <Button variant="plain" onClick={() => setEditing(true)} className="hidden lg:inline-flex" icon={<Pencil className="size-4" />}>Edit</Button>
      <button type="button" onClick={() => setEditing(true)} className="pressable rounded-full px-2 py-1 text-body text-accent-text lg:hidden">Edit</button>
      <Menu label="More actions" trigger={<IconButton label="More actions"><Ellipsis className="size-[22px] lg:size-[18px]" strokeWidth={2.2} /></IconButton>} items={items} />
      <ProjectSheet open={editing} onClose={() => setEditing(false)} clientId={clientId} currency={currency} project={project} />
    </>
  );
}
