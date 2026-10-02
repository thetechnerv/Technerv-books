import { Page } from '@/components/ui/page';
import { cn } from '@/lib/cn';

function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-fill', className)} />;
}

function Rows({ n = 6 }: { n?: number }) {
  return (
    <div className="mb-7 overflow-hidden rounded-group bg-cell shadow-card group-rows" style={{ ['--row-inset' as string]: '58px' }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-[60px] items-center gap-3 px-4 lg:h-12 lg:px-3">
          <Bone className="size-[30px] shrink-0 rounded-[8px]" />
          <div className="flex-1 space-y-1.5"><Bone className="h-3.5 w-1/2" /><Bone className="h-3 w-1/3" /></div>
          <Bone className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function BankingSkeleton() {
  return (
    <Page title="Banking">
      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-group bg-cell p-4 shadow-card">
            <div className="flex items-center gap-2.5"><Bone className="size-[30px] rounded-[8px]" /><Bone className="h-4 w-32" /></div>
            <Bone className="mt-4 h-8 w-40" />
            <Bone className="mt-2 h-3 w-24" />
            <div className="mt-4 flex gap-2"><Bone className="h-8 w-20 rounded-full" /><Bone className="h-8 w-24 rounded-full" /></div>
          </div>
        ))}
      </div>
      <Bone className="mb-2 h-3 w-28" />
      <Rows n={5} />
    </Page>
  );
}

export function AccountSkeleton() {
  return (
    <Page title="Transactions" back={{ href: '/banking', label: 'Banking' }} toolbar={<Bone className="h-[30px] w-full max-w-md rounded-[9px] lg:h-6" />}>
      <Bone className="mb-5 h-20 w-full rounded-group" />
      <Bone className="mb-2 h-3 w-24" />
      <Rows n={8} />
    </Page>
  );
}

export function ReviewSkeleton() {
  return (
    <Page title="Review" back={{ href: '/banking', label: 'Banking' }} wide>
      <div className="lg:grid lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-6">
        <div className="hidden lg:block"><Bone className="mb-4 h-5 w-full" /><Rows n={8} /></div>
        <div>
          <Bone className="mb-4 h-5 w-full lg:hidden" />
          <div className="rounded-[22px] bg-cell p-5 shadow-card lg:rounded-group">
            <Bone className="h-4 w-40" />
            <Bone className="mt-6 h-6 w-3/4" />
            <Bone className="mt-2 h-4 w-1/2" />
            <Bone className="mt-7 h-10 w-44" />
          </div>
          <div className="mt-6"><Rows n={3} /></div>
        </div>
      </div>
    </Page>
  );
}

export function ListSkeleton({ title, back }: { title: string; back?: { href: string; label: string } }) {
  return (
    <Page title={title} back={back ?? { href: '/banking', label: 'Banking' }}>
      <Bone className="mb-2 h-3 w-24" />
      <Rows n={7} />
    </Page>
  );
}
