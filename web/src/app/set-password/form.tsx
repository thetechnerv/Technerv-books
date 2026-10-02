'use client';
import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { PinPad } from '@/components/ui/pin-pad';
import { LogoMark } from '@/components/shell/logo';
import { setPin, type SetPinState } from './actions';

type Step = 'current' | 'pin' | 'confirm';

export function SetPasswordForm({ firstTime, name, email, next }: { firstTime: boolean; name: string; email: string; next: string }) {
  const [state, action] = useActionState<SetPinState, FormData>(setPin, {});
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>('current');
  const [current, setCurrent] = useState('');
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<{ msg: string; n: number } | null>(null);

  // Server rejected something → go back to the step it was about.
  useEffect(() => {
    if (!state.nonce) return;
    const id = requestAnimationFrame(() => {
      setLocalError(null);
      setConfirm('');
      if (state.step === 'current') { setCurrent(''); setPinValue(''); setStep('current'); }
      else { setPinValue(''); setStep('pin'); }
    });
    return () => cancelAnimationFrame(id);
  }, [state.nonce, state.step]);

  function finish(c: string) {
    if (c !== pin) {
      setLocalError((e) => ({ msg: 'The PINs didn’t match. Try again.', n: (e?.n ?? 0) + 1 }));
      setPinValue(''); setConfirm(''); setStep('pin');
      return;
    }
    const fd = new FormData();
    fd.set('current', current); fd.set('pin', pin); fd.set('confirm', c); fd.set('next', next);
    start(() => action(fd));
  }

  const labels: Record<Step, string> = {
    current: firstTime ? 'Enter your one-time code' : 'Enter your current PIN',
    pin: 'Choose a 4-digit PIN',
    confirm: 'Enter it again',
  };
  const error = localError?.msg ?? (pending ? '' : state.error);
  const shake = (state.nonce ?? 0) + (localError?.n ?? 0) * 1000;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[340px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={48} className="mb-3" />
          <h1 className="text-title2 font-bold">{firstTime ? `Welcome, ${name}` : 'Change PIN'}</h1>
          <p className="mt-1 text-footnote text-label-2">{firstTime ? 'Set the PIN you’ll use to sign in. The one-time code stops working after this.' : email}</p>
        </div>
        {step === 'current' && (
          <PinPad key="current" length={firstTime ? 6 : 4} value={current} onChange={setCurrent} label={labels.current} shakeKey={shake} disabled={pending}
            onComplete={() => { setLocalError(null); setTimeout(() => setStep('pin'), 120); }} />
        )}
        {step === 'pin' && (
          <PinPad key="pin" length={4} value={pin} onChange={setPinValue} label={labels.pin} shakeKey={shake} disabled={pending}
            onComplete={() => { setLocalError(null); setTimeout(() => setStep('confirm'), 120); }} />
        )}
        {step === 'confirm' && (
          <PinPad key="confirm" length={4} value={confirm} onChange={setConfirm} label={labels.confirm} disabled={pending} onComplete={finish} />
        )}
        <p role="alert" className="mt-5 min-h-5 text-center text-footnote text-red">{error}</p>
        <p className="mt-4 text-center text-caption text-label-3">
          Avoid obvious PINs like 1234 or 0000.
          {!firstTime && <> · <Link href="/settings/account" className="text-accent-text">Cancel</Link></>}
        </p>
      </div>
    </div>
  );
}
