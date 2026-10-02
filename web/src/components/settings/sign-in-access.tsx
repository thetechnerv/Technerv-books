'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNowStrict } from 'date-fns';
import { KeyRound, Copy, Share, ShieldOff, Check } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Menu } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { issueSignIn, revokeAccess } from '@/app/(app)/settings/members/actions';
import type { Row as DbRow } from '@/lib/types';
import { relativeDay } from '@/lib/format';

type Member = DbRow<'members'>;

function status(m: Member) {
  if (!m.active) return { label: 'No access', tone: 'gray' as const, detail: 'Inactive' };
  if (!m.user_id) return { label: 'Not set up', tone: 'orange' as const, detail: 'Create a one-time code to invite them' };
  if (m.must_change_password) {
    const exp = m.temp_password_expires_at ? new Date(m.temp_password_expires_at) : null;
    if (exp && exp < new Date()) return { label: 'Expired', tone: 'red' as const, detail: 'One-time code expired — issue a new one' };
    return { label: 'Invited', tone: 'blue' as const, detail: exp ? `One-time code expires in ${formatDistanceToNowStrict(exp)}` : 'Waiting for first sign-in' };
  }
  if (!m.password_changed_at) return { label: 'Not set up', tone: 'orange' as const, detail: 'No PIN yet — create a one-time code' };
  return {
    label: 'Active', tone: 'accent' as const,
    detail: [m.last_sign_in_at && `Last signed in ${relativeDay(m.last_sign_in_at).toLowerCase()}`, m.password_changed_at && `password set ${relativeDay(m.password_changed_at).toLowerCase()}`].filter(Boolean).join(' · ') || 'Signed in before',
  };
}

export function SignInAccess({ members, meId, isOwner }: { members: Member[]; meId: string; isOwner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<{ code: string; expires: string; name: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function issue(m: Member) {
    start(async () => {
      const reset = !!(m.password_changed_at || m.must_change_password);
      if (reset && !(await confirm({
        title: m.id === meId ? 'Reset your own PIN?' : `Reset ${m.full_name.split(' ')[0]}’s PIN?`,
        message: 'Their current PIN stops working immediately. They’ll sign in with a new one-time code and choose a new PIN.',
        confirmLabel: 'Reset', destructive: true,
      }))) return;
      const r = await issueSignIn(m.id);
      if (!r.ok) return toast({ title: r.error, tone: 'error' });
      setCopied(false);
      setIssued(r.data!);
      router.refresh();
    });
  }

  function revoke(m: Member) {
    start(async () => {
      if (!(await confirm({ title: `Remove ${m.full_name.split(' ')[0]}’s access?`, message: 'They’re signed out of the app and can’t sign in again. Their records stay. You can re-invite them later.', confirmLabel: 'Remove access', destructive: true }))) return;
      const r = await revokeAccess(m.id);
      toast(r.ok ? { title: r.message ?? 'Access removed' } : { title: r.error, tone: 'error' });
      router.refresh();
    });
  }

  const shareText = issued && `Tech Nerv Accounts sign-in\n${location.origin}/login\nEmail: ${issued.email}\nOne-time code: ${issued.code}\n(tap “I have a one-time code”; works once, until ${new Date(issued.expires).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} — then you’ll choose your own PIN)`;

  return (
    <>
      <Section
        title="Sign-in access"
        inset={60}
        footer="Everyone signs in with their email and a 4-digit PIN. PINs are stored hashed — nobody, including owners, can see them. Owners hand out a one-time code; the person chooses their PIN on first sign-in. 5 wrong tries lock the sign-in for 15 minutes; 10 lock it until an owner issues a new code. No emails are sent."
      >
        {members.map((m) => {
          const s = status(m);
          return (
            <Row key={m.id} icon={<Avatar name={m.full_name} color={m.color} initials={m.initials} size={32} />} title={m.full_name} subtitle={s.detail} wrap>
              <Badge tone={s.tone}>{s.label}</Badge>
              {isOwner && (
                <Menu
                  label={`Sign-in options for ${m.full_name}`}
                  trigger={<Button size="sm" variant="gray" disabled={pending}>{m.password_changed_at || m.must_change_password ? 'Manage' : 'Set up'}</Button>}
                  items={[
                    { label: m.password_changed_at || m.must_change_password ? 'Reset PIN…' : 'Create one-time code', icon: <KeyRound />, onSelect: () => issue(m), disabled: !m.active },
                    ...(m.id !== meId && m.user_id && m.active ? (['separator', { label: 'Remove access…', icon: <ShieldOff />, destructive: true, onSelect: () => revoke(m) }] as const) : []),
                  ]}
                />
              )}
            </Row>
          );
        })}
      </Section>

      <Sheet open={!!issued} onClose={() => setIssued(null)} title="One-time code" cancelLabel={null} fit size="sm"
        action={<button onClick={() => setIssued(null)} className="text-body font-semibold text-accent-text lg:text-subhead">Done</button>}>
        {issued && (
          <div className="pb-2 pt-1">
            <p className="text-center text-subhead text-label-2">For <span className="font-semibold text-label">{issued.name}</span> · {issued.email}</p>
            <div className="my-5 select-all rounded-[16px] bg-cell px-4 py-5 text-center font-mono text-[34px] font-semibold tracking-[0.12em] shadow-card tabular lg:text-[28px]">
              {issued.code.slice(0, 3)} {issued.code.slice(3)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="tinted" size="lg" icon={copied ? <Check className="size-5" /> : <Copy className="size-5" />}
                onClick={async () => { await navigator.clipboard.writeText(issued.code); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</Button>
              <Button variant="filled" size="lg" icon={<Share className="size-5" />}
                onClick={async () => { try { if (navigator.share) await navigator.share({ text: shareText! }); else { await navigator.clipboard.writeText(shareText!); toast({ title: 'Sign-in details copied' }); } } catch {} }}>Share</Button>
            </div>
            <p className="mt-4 text-center text-footnote text-label-2">
              Works once, for 72 hours. Share it in person or by text — this is the only time it’s shown.
              They enter their email, tap “I have a one-time code”, type it, then choose their 4-digit PIN.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
