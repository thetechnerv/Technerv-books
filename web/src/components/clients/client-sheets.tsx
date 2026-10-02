'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Page } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Sheet, SheetAction } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import type { Row } from '@/lib/types';
import { ClientForm, type TaxRateOption } from './client-form';

type Shared = { taxRates: TaxRateOption[]; others: { id: string; name: string }[]; defaultTerms: number };

/** /clients/new — full-screen form with a thumb-reachable save bar on phones. */
export function NewClientScreen({ taxRates, others, defaultTerms }: Shared) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  return (
    <Page
      title="New client"
      back={{ href: '/clients', label: 'Clients' }}
      actions={<Button variant="filled" type="submit" form="new-client" loading={pending} className="hidden lg:inline-flex">Add client</Button>}
    >
      <div className="mx-auto max-w-[640px]">
        <ClientForm
          formId="new-client"
          taxRates={taxRates}
          others={others}
          defaultTerms={defaultTerms}
          autoFocus
          onPending={setPending}
          onSaved={(id) => { toast({ title: 'Client added' }); router.push(`/clients/${id}`); }}
        />
      </div>
      {/* Sticky save bar above the tab bar on phones */}
      <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+max(var(--safe-bottom),10px)+10px)] z-30 px-4 lg:hidden">
        <Button variant="filled" size="lg" block type="submit" form="new-client" loading={pending} className="mx-auto max-w-[440px] shadow-bar">
          Add client
        </Button>
      </div>
    </Page>
  );
}

/** Edit sheet on the client page. */
export function EditClientSheet({ open, onClose, client, ...shared }: Shared & { open: boolean; onClose: () => void; client: Row<'clients'> }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  // Discard unsaved edits when the sheet is reopened.
  const [prevOpen, setPrevOpen] = useState(open);
  const [nonce, setNonce] = useState(0);
  if (open !== prevOpen) { setPrevOpen(open); if (open) setNonce((n) => n + 1); }
  return (
    <Sheet open={open} onClose={onClose} title="Edit client" size="md" action={<SheetAction form="edit-client" loading={pending}>Save</SheetAction>}>
      <ClientForm
        key={nonce}
        formId="edit-client"
        client={client}
        {...shared}
        onPending={setPending}
        onSaved={() => { toast({ title: 'Changes saved' }); onClose(); router.refresh(); }}
      />
    </Sheet>
  );
}
