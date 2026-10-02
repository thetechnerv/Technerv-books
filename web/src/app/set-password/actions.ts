'use server';
import { redirect } from 'next/navigation';
import { adminDb, passwordProbe, sessionClient } from '@/lib/db';
import { derivePassword, pinProblem, recordFailure, lockMessage } from '@/lib/passwords';

export type SetPinState = { error?: string; step?: 'current' | 'pin'; nonce?: number };

export async function setPin(prev: SetPinState, fd: FormData): Promise<SetPinState> {
  const current = String(fd.get('current') ?? '').replace(/\D/g, '');
  const pin = String(fd.get('pin') ?? '').replace(/\D/g, '');
  const confirm = String(fd.get('confirm') ?? '').replace(/\D/g, '');
  const n = String(fd.get('next') ?? '/');
  const next = n.startsWith('/') && !n.startsWith('//') && n !== '/set-password' ? n : '/';
  const nonce = (prev.nonce ?? 0) + 1;

  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  const { data: member } = await adminDb().from('members').select('*').ilike('email', user.email).maybeSingle();
  if (!member?.active) redirect('/login?error=not-a-member');
  const locked = lockMessage(member);
  if (locked) return { error: locked, step: 'current', nonce };

  // Re-check the one-time code / current PIN so a session left open on a
  // lost phone can't take over the account after an owner resets it.
  const probe = await passwordProbe().auth.signInWithPassword({ email: user.email, password: derivePassword(user.email, current) });
  if (probe.error) {
    const msg = await recordFailure(member);
    return { error: member.must_change_password ? msg.replace('Wrong PIN', 'Wrong code') : msg, step: 'current', nonce };
  }

  const problem = pinProblem(pin);
  if (problem) return { error: problem, step: 'pin', nonce };
  if (pin !== confirm) return { error: 'The PINs didn’t match. Try again.', step: 'pin', nonce };
  if (pin === current) return { error: 'Choose a new PIN.', step: 'pin', nonce };

  const { error } = await supabase.auth.updateUser({ password: derivePassword(user.email, pin) });
  if (error) return { error: error.message, step: 'pin', nonce };

  await adminDb().from('members').update({
    must_change_password: false, temp_password_expires_at: null, temp_password_issued_by: null,
    password_changed_at: new Date().toISOString(), failed_pin_attempts: 0, locked_until: null,
  }).eq('id', member.id);
  redirect(next);
}
