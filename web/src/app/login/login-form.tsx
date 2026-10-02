'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/shell/logo';

const supabase = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

export function LoginForm({ next, error: initialError }: { next: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError === 'not-a-member' ? 'That account isn’t a member of Tech Nerv.' : '');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) setError(error.message.includes('Signups not allowed') ? 'Only Tech Nerv members can sign in.' : error.message);
    else setStep('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase().auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) setError('That code didn’t work. Check the latest email and try again.');
    else { router.replace(next); router.refresh(); }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={64} className="mb-5 drop-shadow-[0_10px_24px_rgba(3,221,170,0.35)]" />
          <h1 className="text-title1 font-bold">Tech Nerv Accounts</h1>
          <p className="mt-1.5 text-subhead text-label-2">
            {step === 'email' ? 'Sign in with your work email. We’ll send you a one-time code.' : <>Enter the 6-digit code sent to <span className="font-medium text-label">{email}</span>.</>}
          </p>
        </div>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <input
              type="email" required autoFocus autoComplete="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-[52px] w-full rounded-[14px] bg-cell px-4 text-body shadow-card outline-none focus:shadow-[0_0_0_2px_var(--accent)] lg:h-11 lg:rounded-md"
            />
            <Button type="submit" variant="filled" size="lg" block loading={busy}>Continue</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <input
              required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="••••••"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="tabular h-[60px] w-full rounded-[14px] bg-cell text-center font-display text-[28px] font-semibold tracking-[0.4em] shadow-card outline-none focus:shadow-[0_0_0_2px_var(--accent)] lg:h-14"
            />
            <Button type="submit" variant="filled" size="lg" block loading={busy} disabled={code.length < 6}>Sign in</Button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); }} className="w-full py-2 text-subhead text-accent-text">Use a different email</button>
          </form>
        )}
        {error && <p className="mt-4 text-center text-footnote text-red">{error}</p>}
      </div>
    </div>
  );
}
