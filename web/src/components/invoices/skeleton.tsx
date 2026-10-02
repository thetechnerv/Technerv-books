import { cn } from '@/lib/cn';

const Bar = ({ className }: { className?: string }) => <span className={cn('block animate-pulse rounded-md bg-fill', className)} />;

/** Placeholder for list screens while the server renders. */
export function ListSkeleton({ title, stats = 3 }: { title: string; stats?: number }) {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-[calc(52px+var(--safe-top))] lg:hairline-b" />
      <div className="mx-auto px-4 lg:px-8">
        <h1 className="pb-2 text-large font-bold lg:hidden">{title}</h1>
        <div className="flex gap-2 py-2 lg:py-3"><Bar className="h-8 w-full max-w-[420px] rounded-[9px]" /><Bar className="hidden h-8 w-56 lg:block" /></div>
        <div className="mt-3 flex gap-3 overflow-hidden lg:grid lg:grid-cols-3">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="w-[68%] shrink-0 rounded-group bg-cell p-4 shadow-card lg:w-auto"><Bar className="h-3 w-20" /><Bar className="mt-3 h-6 w-32" /><Bar className="mt-2 h-3 w-24" /></div>
          ))}
        </div>
        <Bar className="mt-7 h-3 w-24" />
        <div className="mt-2 overflow-hidden rounded-group bg-cell shadow-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 [&+&]:hairline-t">
              <Bar className="size-9 rounded-[10px]" />
              <div className="flex-1"><Bar className="h-3.5 w-40" /><Bar className="mt-2 h-3 w-56 max-w-full" /></div>
              <div className="flex flex-col items-end"><Bar className="h-3.5 w-16" /><Bar className="mt-2 h-4 w-12 rounded-full" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Placeholder for the invoice detail / editor. */
export function DetailSkeleton() {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label="Loading">
      <div className="h-[calc(52px+var(--safe-top))] lg:hairline-b" />
      <div className="mx-auto max-w-[1120px] px-4 pt-3 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:px-8 lg:pt-6">
        <div>
          <div className="rounded-group bg-cell p-5 shadow-card"><Bar className="h-3 w-24" /><Bar className="mt-3 h-9 w-48" /><Bar className="mt-3 h-3 w-40" /></div>
          <div className="mt-6 aspect-[8.5/11] w-full animate-pulse rounded-group bg-cell shadow-card" />
        </div>
        <div className="mt-6 space-y-3 lg:mt-0">
          {Array.from({ length: 5 }).map((_, i) => <Bar key={i} className="h-10 w-full rounded-[12px]" />)}
        </div>
      </div>
    </div>
  );
}
