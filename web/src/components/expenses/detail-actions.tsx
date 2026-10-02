'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MoreHorizontal, Pencil, Trash2, CheckCircle2, Undo2 } from 'lucide-react';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { deleteExpense, setExpenseSettled } from '@/app/(app)/expenses/actions';

/** Nav-bar actions on an expense: Edit, Duplicate, Delete. */
export function ExpenseNavActions({ id, vendor, locked }: { id: string; vendor: string; locked: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [, start] = useTransition();
  async function remove() {
    if (!(await confirm({ title: `Delete ${vendor}?`, message: 'The expense and its receipts are removed. A matched bank line goes back to Review.', confirmLabel: 'Delete', destructive: true }))) return;
    const r = await deleteExpense(id);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    toast({ title: 'Expense deleted' });
    start(() => { router.push('/expenses'); router.refresh(); });
  }
  const items: MenuItem[] = [
    { label: 'Duplicate', icon: <Copy />, href: `/expenses/new?from=${id}` },
    ...(locked ? [] : ['separator' as const, { label: 'Delete', icon: <Trash2 />, destructive: true, onSelect: remove }]),
  ];
  return (
    <>
      {!locked && <Button href={`/expenses/${id}?edit=1`} variant="plain" size="md" icon={<Pencil className="size-4" />} className="hidden lg:inline-flex">Edit</Button>}
      {!locked && <IconButton label="Edit" href={`/expenses/${id}?edit=1`} className="lg:hidden"><Pencil className="size-5" /></IconButton>}
      <Menu label="More actions" items={items} trigger={<IconButton label="More actions"><MoreHorizontal className="size-[22px]" /></IconButton>} />
    </>
  );
}

/** "Mark settled" for out-of-pocket / personal-on-business items, with undo. */
export function SettleToggle({ id, settled }: { id: string; settled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  async function flip(next: boolean, quiet = false) {
    setBusy(true);
    const r = await setExpenseSettled(id, next);
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'error' });
    if (!quiet) toast({ title: next ? 'Marked settled' : 'Marked unsettled', action: { label: 'Undo', onClick: () => flip(!next, true) } });
    start(() => router.refresh());
  }
  return settled ? (
    <Button variant="gray" size="md" loading={busy} icon={<Undo2 className="size-4" />} onClick={() => flip(false)}>Mark unsettled</Button>
  ) : (
    <Button variant="tinted" size="md" loading={busy} icon={<CheckCircle2 className="size-4" />} onClick={() => flip(true)}>Mark settled</Button>
  );
}
