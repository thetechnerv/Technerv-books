import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-fill-2', className)} />;
}

/** Generic list-screen placeholder: large title, toolbar, grouped rows. */
export function ListSkeleton({ rows = 8, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <div className="mx-auto px-4 pt-[calc(var(--safe-top)+64px)] lg:max-w-[1120px] lg:px-8 lg:pt-20">
      <Skeleton className="mb-4 h-9 w-44 lg:hidden" />
      {toolbar && <Skeleton className="mb-6 h-8 w-full max-w-[420px] rounded-[9px]" />}
      <Skeleton className="mb-2 h-3 w-24" />
      <div className="overflow-hidden rounded-group bg-cell shadow-card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 hairline-b">
            <Skeleton className="size-[30px] rounded-[8px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
