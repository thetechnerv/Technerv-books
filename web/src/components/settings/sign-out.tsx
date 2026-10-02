'use client';
import { useTransition } from 'react';
import { Row } from '@/components/ui/group';
import { useToast } from '@/components/ui/toast';
import { signOut } from '@/app/(app)/settings/actions';

export function SignOutRow({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Row
      title={<span className={disabled ? 'text-label-3' : 'text-red'}>{pending ? 'Signing out…' : 'Sign out'}</span>}
      onClick={disabled || pending ? undefined : () => start(async () => {
        const r = await signOut();
        if (r && !r.ok) toast({ title: r.error, tone: 'error' });
      })}
    />
  );
}
