import { cn } from '@/lib/cn';

export const Bone = ({ className }: { className?: string }) => <span aria-hidden className={cn('block animate-pulse rounded-md bg-fill', className)} />;

/** Matches the Page scaffold: nav bar, large title on phones, optional toolbar. */
function Frame({ title, back, toolbar, children }: { title: string; back?: string; toolbar?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <div className="lg:material-bar lg:hairline-b" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="mx-auto flex h-[52px] items-center gap-3 px-4 lg:px-8">
          {back ? <span className="text-body text-accent-text lg:text-subhead">‹ {back}</span> : null}
          <span className="hidden text-title3 font-bold lg:inline">{title}</span>
        </div>
      </div>
      <div className="px-4 pb-2 pt-0.5 lg:hidden"><h1 className="text-large font-bold">{title}</h1></div>
      {toolbar && (
        <div className="px-4 py-2 lg:px-8 lg:py-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <Bone className="h-[34px] w-full rounded-[9px] lg:h-7 lg:w-[300px]" />
            <Bone className="h-9 w-full rounded-[10px] lg:h-7 lg:w-[320px]" />
          </div>
        </div>
      )}
      <main className="mx-auto px-4 pt-3 lg:px-8 lg:pt-6">{children}</main>
    </div>
  );
}

function Rows({ n, tile = 40 }: { n: number; tile?: number }) {
  return (
    <div className="overflow-hidden rounded-group bg-cell shadow-card">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 lg:px-3 lg:py-2.5">
          {tile > 0 && <span className="shrink-0 animate-pulse rounded-[10px] bg-fill" style={{ width: tile, height: tile }} />}
          <span className="min-w-0 flex-1 space-y-1.5">
            <Bone className="h-3.5 w-[46%]" />
            <Bone className="h-3 w-[64%] opacity-70" />
          </span>
          <Bone className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ClientsListSkeleton() {
  return (
    <Frame title="Clients" toolbar>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:max-w-[640px]">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 rounded-group bg-cell p-4 shadow-card">
            <Bone className="h-3 w-24" /><Bone className="h-6 w-28" /><Bone className="h-3 w-20 opacity-70" />
          </div>
        ))}
      </div>
      <Rows n={8} />
    </Frame>
  );
}

export function ClientDetailSkeleton() {
  return (
    <Frame title="Client" back="Clients">
      <div className="mb-5 rounded-group bg-cell p-4 shadow-card lg:p-5">
        <div className="flex items-start gap-4">
          <span className="size-[58px] shrink-0 animate-pulse rounded-[16px] bg-fill" />
          <div className="flex-1 space-y-2 pt-1">
            <Bone className="h-4 w-1/2" /><Bone className="h-3 w-2/3 opacity-70" />
            <div className="flex gap-1.5 pt-1"><Bone className="h-5 w-16 rounded-full" /><Bone className="h-5 w-12 rounded-full" /><Bone className="h-5 w-14 rounded-full" /></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 lg:max-w-[520px]">
          {[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[58px] rounded-[12px] lg:h-[50px]" />)}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('space-y-2 rounded-group bg-cell p-4 shadow-card', i === 0 && 'col-span-2 lg:col-span-1')}>
            <Bone className="h-3 w-20" /><Bone className="h-5 w-24" /><Bone className="h-3 w-16 opacity-70" />
          </div>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[1.55fr_1fr] lg:gap-6">
        <Rows n={6} tile={0} />
        <div className="mt-7 space-y-6 lg:mt-0"><Rows n={2} tile={0} /><Rows n={3} tile={0} /></div>
      </div>
    </Frame>
  );
}

export function ProjectSkeleton() {
  return (
    <Frame title="Project" back="Client">
      <div className="mb-5 space-y-3 rounded-group bg-cell p-4 shadow-card lg:p-5">
        <div className="flex gap-2"><Bone className="h-5 w-16 rounded-full" /><Bone className="h-5 w-32" /></div>
        <Bone className="h-3 w-24" /><Bone className="h-9 w-48" /><Bone className="h-2 w-full rounded-full" />
      </div>
      <div className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-group bg-cell shadow-card lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 p-4"><Bone className="h-3 w-16" /><Bone className="h-5 w-24" /></div>)}
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-6"><Rows n={4} tile={0} /><div className="mt-7 lg:mt-0"><Rows n={4} tile={30} /></div></div>
    </Frame>
  );
}
