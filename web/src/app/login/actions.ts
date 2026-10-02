'use server';
import { redirect } from 'next/navigation';
import { adminDb, sessionClient } from '@/lib/db';
import { derivePassword, lockMessage, recordFailure, TEMP_CODE_LENGTH, PIN_LENGTH } from '@/lib/passwords';

export type LoginState = { error?: string; email?: string; nonce?: number };

function safeNext(n: unknown) {
  const s = typeof n === 'string' ? n : '/';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/';
}

const WRONG = 'Email or PIN is incorrect.';

export async function signIn(prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const pin = String(fd.get('pin') ?? '').replace(/\D/g, '');
  const next = safeNext(fd.get('next'));
  const nonce = (prev.nonce ?? 0) + 1;
  if (!email || (pin.length !== PIN_LENGTH && pin.length !== TEMP_CODE_LENGTH)) return { error: 'Enter your email and PIN.', email, nonce };

  const { data: member } = await adminDb().from('members').select('*').ilike('email', email).maybeSingle();
  if (!member || !member.active || !member.user_id) return { error: WRONG, email, nonce };
  const locked = lockMessage(member);
  if (locked) return { error: locked, email, nonce };
  // A 6-digit entry only makes sense while a one-time code is outstanding.
  if (pin.length === TEMP_CODE_LENGTH && !member.must_change_password) return { error: 'Enter your 4-digit PIN.', email, nonce };

  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: derivePassword(email, pin) });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { error: 'Too many attempts. Wait a minute and try again.', email, nonce };
    return { error: await recordFailure(member), email, nonce };
  }
  if (member.must_change_password && member.temp_password_expires_at && new Date(member.temp_password_expires_at) < new Date()) {
    await supabase.auth.signOut();
    return { error: 'That one-time code has expired. Ask an owner for a new one.', email, nonce };
  }
  await adminDb().from('members').update({ last_sign_in_at: new Date().toISOString(), failed_pin_attempts: 0, locked_until: null }).eq('id', member.id);
  if (member.must_change_password) redirect(`/set-password?next=${encodeURIComponent(next)}`);
  redirect(next);
}
