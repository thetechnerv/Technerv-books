'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, ArchiveRestore, Ellipsis, FileText, Pencil, FolderPlus, ClipboardList, HandCoins } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import type { Row } from '@/lib/types';
import { setClientArchivedAction } from '@/app/(app)/clients/actions';
import { EditClientSheet } from './client-sheets';
import { ProjectSheet } from './project-sheet';
import type { TaxRateOption } from './client-form';

type Props = {
  client: Row<'clients'>;
  taxRates: TaxRateOption[];
  others: { id: string; name: string }[];
  defaultTerms: number;
  open: { count: number; label: string };
};

/** Archive with forgiveness: undo toast normally, a confirm only when money is still owed. */
export function useArchive(client: Row<'clients'>, open: Props['open']) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();

  const run = (archived: boolean, quiet = false) => start(async () => {
    const res = await setClientArchivedAction(client.id, archived);
    if (!res.ok) { toast({ title: res.error, tone: 'error' }); return; }
    router.refresh();
    if (quiet) return;
    toast(archived
      ? { title: `${client.display_name} archived`, action: { label: 'Undo', onClick: () => run(false, true) } }
      : { title: `${client.display_name} is active again` });
  });

  async function toggle() {
    if (client.archived) return run(false);
    if (open.count > 0) {
      const ok = await confirm({
        title: `Archive ${client.display_name}?`,
        message: `They still owe ${open.label} on ${open.count === 1 ? 'an open invoice' : `${open.count} open invoices`}. Archived clients are hidden from lists but keep their history.`,
        confirmLabel: 'Archive',
        destructive: true,
      });
      if (!ok) return;
    }
    run(true);
  }
  return { toggle, pending };
}

export function ClientNavActions({ client, taxRates, others, defaultTerms, open }: Props) {
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const archive = useArchive(client, open);
  return (
    <>
      <Button variant="plain" onClick={() => setEditing(true)} className="hidden lg:inline-flex" icon={<Pencil className="size-4" />}>Edit</Button>
      <button type="button" onClick={() => setEditing(true)} className="pressable rounded-full px-2 py-1 text-body text-accent-text lg:hidden">Edit</button>
      <Menu
        label="More actions"
        trigger={<IconButton label="More actions"><Ellipsis className="size-[22px] lg:size-[18px]" strokeWidth={2.2} /></IconButton>}
        items={[
          { label: 'New invoice', icon: <FileText />, href: `/invoices/new?client=${client.id}` },
          { label: 'New estimate', icon: <ClipboardList />, href: `/invoices/new?kind=estimate&client=${client.id}` },
          { label: 'Record payment', icon: <HandCoins />, href: `/payments?new=1&client=${client.id}` },
          { label: 'New project', icon: <FolderPlus />, onSelect: () => setNewProject(true) },
          'separator',
          { label: 'Edit details', icon: <Pencil />, onSelect: () => setEditing(true) },
          client.archived
            ? { label: 'Unarchive', icon: <ArchiveRestore />, onSelect: archive.toggle, disabled: archive.pending }
            : { label: 'Archive', icon: <Archive />, onSelect: archive.toggle, destructive: true, disabled: archive.pending },
        ]}
      />
      <EditClientSheet open={editing} onClose={() => setEditing(false)} client={client} taxRates={taxRates} others={others} defaultTerms={defaultTerms} />
      <ProjectSheet open={newProject} onClose={() => setNewProject(false)} clientId={client.id} currency={client.currency} />
    </>
  );
}

/** Banner + bottom-of-page control. */
export function ArchiveControl({ client, open, variant }: { client: Row<'clients'>; open: Props['open']; variant: 'banner' | 'button' }) {
  const archive = useArchive(client, open);
  if (variant === 'banner') {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-group bg-orange-soft px-4 py-3">
        <Archive className="size-5 shrink-0 text-orange" strokeWidth={2} />
        <p className="min-w-0 flex-1 text-subhead">Archived. Hidden from client lists and pickers.</p>
        <Button variant="plain" size="sm" onClick={archive.toggle} loading={archive.pending}>Unarchive</Button>
      </div>
    );
  }
  return (
    <Button variant={client.archived ? 'gray' : 'destructive-tinted'} block size="lg" onClick={archive.toggle} loading={archive.pending}
      icon={client.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}>
      {client.archived ? 'Unarchive client' : 'Archive client'}
    </Button>
  );
}
