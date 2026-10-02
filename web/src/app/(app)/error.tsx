'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-soft text-red"><AlertTriangle className="size-7" /></span>
      <h1 className="text-title2 font-bold">Something went wrong</h1>
      <p className="mt-1.5 max-w-sm text-subhead text-label-2">{error.message || 'The page couldn’t load. Your data is safe — try again.'}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="filled" onClick={reset}>Try again</Button>
        <Button variant="gray" href="/">Go home</Button>
      </div>
    </div>
  );
}
