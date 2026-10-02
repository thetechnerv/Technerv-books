import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto px-4 pt-[calc(var(--safe-top)+64px)] lg:max-w-[1120px] lg:px-8 lg:pt-20">
      <Skeleton className="mb-6 h-9 w-56 lg:hidden" />
      <div className="mb-7 flex gap-3 overflow-hidden lg:grid lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[128px] w-[78%] shrink-0 rounded-group lg:w-auto" />)}
      </div>
      <div className="lg:grid lg:grid-cols-[1.45fr_1fr] lg:gap-6">
        <Skeleton className="mb-7 h-[320px] rounded-group" />
        <Skeleton className="h-[260px] rounded-group" />
      </div>
    </div>
  );
}
