import { Skeleton } from '@/components/ui/skeleton';

function Rows({ n, className = '' }: { n: number; className?: string }) {
  return (
    <div className={`mb-7 overflow-hidden rounded-group bg-cell shadow-card ${className}`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 hairline-b">
          <Skeleton className="size-[26px] rounded-full" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

const Frame = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className={`mx-auto px-4 pt-[calc(var(--safe-top)+64px)] lg:px-8 lg:pt-20 ${wide ? '' : 'lg:max-w-[1120px]'}`} aria-busy="true" aria-label="Loading">
    <Skeleton className="mb-3 h-9 w-52 lg:hidden" />
    <Skeleton className="mb-6 h-8 w-full max-w-[300px] rounded-[9px]" />
    {children}
  </div>
);

/** Tax Centre: four stat cards, checklist, deadlines. */
export function TaxSkeleton() {
  return (
    <Frame>
      <div className="mb-7 flex gap-3 overflow-hidden lg:grid lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[112px] w-[78%] shrink-0 rounded-group lg:w-auto" />)}
      </div>
      <div className="lg:grid lg:grid-cols-[1.45fr_1fr] lg:gap-6">
        <div><Skeleton className="mb-2 h-3 w-40" /><Rows n={8} /></div>
        <div><Skeleton className="mb-2 h-3 w-24" /><Rows n={4} /></div>
      </div>
    </Frame>
  );
}

/** Worksheet / package pages: a tall card on the left, grouped lists on the right. */
export function WorksheetSkeleton() {
  return (
    <Frame>
      <Skeleton className="mb-7 h-[92px] rounded-group" />
      <div className="lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-6">
        <div><Skeleton className="mb-2 h-3 w-28" /><Rows n={12} /></div>
        <div><Skeleton className="mb-2 h-3 w-36" /><Rows n={5} /><Skeleton className="mb-2 h-3 w-36" /><Rows n={4} /></div>
      </div>
    </Frame>
  );
}

/** Reports: summary tiles, a chart, a table. */
export function ReportSkeleton({ wide }: { wide?: boolean }) {
  return (
    <Frame wide={wide}>
      <div className="mb-6 grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-group" />)}</div>
      <Skeleton className="mb-7 h-[260px] rounded-group" />
      <Rows n={8} />
    </Frame>
  );
}

/** Documents: statements grid then grouped rows. */
export function VaultSkeleton() {
  return (
    <Frame>
      <Skeleton className="mb-2 h-3 w-44" />
      <Skeleton className="mb-7 h-[150px] rounded-group" />
      <Skeleton className="mb-3 h-6 w-24" />
      <Rows n={6} />
    </Frame>
  );
}
