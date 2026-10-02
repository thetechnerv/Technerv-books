'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PinPad } from '@/components/ui/pin-pad';
import { LogoMark } from '@/components/shell/logo';
import { signIn, type LoginState } from './actions';

const EMAIL_KEY = 'tn-sign-in-email';

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, { error: initialError });
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'pin'>('email');
  const [useCode, setUseCode] = useState(false);
  const [pin, setPin] = useState('');

  // Remember who signs in on this device so next time it's just the PIN.
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(EMAIL_KEY) ?? ''; } catch {}
    if (!saved) return;
    const id = requestAnimationFrame(() => { setEmail(saved); setStep('pin'); });
    return () => cancelAnimationFrame(id);
  }, []);

  // Wrong PIN → clear the dots for another go.
  useEffect(() => {
    if (!state.nonce) return;
    const id = requestAnimationFrame(() => setPin(''));
    return () => cancelAnimationFrame(id);
  }, [state.nonce]);

  function submit(value: string) {
    try { localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); } catch {}
    const fd = new FormData();
    fd.set('email', email);
    fd.set('pin', value);
    fd.set('next', next);
    start(() => action(fd));
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-4 drop-shadow-[0_10px_24px_rgba(3,221,170,0.35)]" />
          <h1 className="text-title2 font-bold">Tech Nerv Accounts</h1>
        </div>

        {step === 'email' ? (
          <form onSubmit={(e) => { e.preventDefault(); if (email.includes('@')) setStep('pin'); }} className="space-y-3">
            <p className="mb-4 text-center text-subhead text-label-2">Enter your email, then your 4-digit PIN.</p>
            <input type="email" required autoFocus autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-[52px] w-full rounded-[14px] bg-cell px-4 text-body shadow-card outline-none focus:shadow-[0_0_0_2px_var(--accent)] lg:h-11 lg:rounded-md" />
            <Button type="submit" variant="filled" size="lg" block icon={<ChevronRight className="size-5" />}>Continue</Button>
          </form>
        ) : (
          <>
            <PinPad
              length={useCode ? 6 : 4}
              value={pin}
              onChange={setPin}
              onComplete={submit}
              shakeKey={state.nonce}
              disabled={pending}
              label={useCode ? 'Enter your one-time code' : 'Enter PIN'}
            />
            <div className="mt-6 flex flex-col items-center gap-1 text-center">
              <p className="text-footnote text-label-2">{email}</p>
              <div className="flex gap-4 text-footnote font-medium">
                <button className="text-accent-text" onClick={() => { setPin(''); setUseCode((u) => !u); }}>
                  {useCode ? 'Use my PIN' : 'I have a one-time code'}
                </button>
                <button className="text-accent-text" onClick={() => { setPin(''); setStep('email'); try { localStorage.removeItem(EMAIL_KEY); } catch {} }}>Not you?</button>
              </div>
            </div>
          </>
        )}
        <p role="alert" className="mt-5 min-h-5 text-center text-footnote text-red">{pending ? '' : state.error}</p>
        <p className="mt-6 text-center text-caption text-label-3">
          Forgot your PIN or locked out? An owner can give you a one-time code in Settings → Members.
        </p>
      </div>
    </div>
  );
}
