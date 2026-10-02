import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-fill text-label-2"><SearchX className="size-7" /></span>
      <h1 className="text-title2 font-bold">Not found</h1>
      <p className="mt-1.5 max-w-sm text-subhead text-label-2">This record may have been deleted, or the link is out of date.</p>
      <Button className="mt-6" variant="filled" href="/">Go home</Button>
    </div>
  );
}
