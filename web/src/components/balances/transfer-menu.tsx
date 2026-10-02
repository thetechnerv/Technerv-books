'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Menu } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { deleteTransfer } from '@/app/(app)/balances/actions';

export function TransferMenu({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [, start] = useTransition();
  async function remove() {
    if (!(await confirm({ title: `Delete this ${label.toLowerCase()}?`, message: 'Any expenses or trips it settled become open again.', confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteTransfer(id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Transfer deleted' });
    start(() => router.refresh());
  }
  return (
    <Menu
      label="Transfer actions"
      items={[{ label: 'Delete transfer', icon: <Trash2 />, destructive: true, onSelect: remove }]}
      trigger={<button type="button" aria-label="Transfer actions" className="pressable flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-fill-2"><MoreHorizontal className="size-[18px]" /></button>}
    />
  );
}
