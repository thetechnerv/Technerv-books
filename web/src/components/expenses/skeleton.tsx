import { cn } from '@/lib/cn';

export function Bone({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-[6px] bg-fill motion-reduce:animate-none', className)} />;
}

/** Page skeleton: large title, optional toolbar, stat cards and grouped rows. */
export function ListSkeleton({ title, toolbar = true, stats = 0, groups = 2, rows = 5, wide }: { title: string; toolbar?: boolean; stats?: number; groups?: number; rows?: number; wide?: boolean }) {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-[52px] lg:material-bar lg:hairline-b" style={{ marginTop: 'var(--safe-top)' }}>
        <div className={cn('mx-auto hidden h-full items-center px-8 lg:flex', !wide && 'max-w-[1120px]')}><span className="text-title3 font-bold">{title}</span></div>
      </div>
      <div className={cn('mx-auto px-4 lg:px-8', !wide && 'lg:max-w-[1120px]')}>
        <h1 className="pb-2 pt-0.5 text-large font-bold lg:hidden">{title}</h1>
        {toolbar && (
          <div className="space-y-2 py-2 lg:flex lg:gap-3 lg:space-y-0 lg:py-3">
            <Bone className="h-[34px] w-full rounded-[9px] lg:h-7 lg:w-[440px]" />
            <Bone className="h-9 w-full rounded-[10px] lg:h-8 lg:w-[260px]" />
          </div>
        )}
        {stats > 0 && (
          <div className="mb-6 mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {Array.from({ length: stats }, (_, i) => (
              <div key={i} className="rounded-group bg-cell p-3.5 shadow-card"><Bone className="h-3 w-16" /><Bone className="mt-2 h-6 w-24" /><Bone className="mt-2 h-2.5 w-20" /></div>
            ))}
          </div>
        )}
        <div className="pt-3">
          {Array.from({ length: groups }, (_, g) => (
            <div key={g} className="mb-6">
              <Bone className="mb-2 ml-4 h-3 w-28 lg:ml-1" />
              <div className="overflow-hidden rounded-group bg-cell shadow-card">
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="flex h-[64px] items-center gap-3 px-4 hairline-b lg:h-12 lg:px-3">
                    <Bone className="size-[30px] rounded-[8px]" />
                    <div className="flex-1"><Bone className="h-3.5 w-2/5" /><Bone className="mt-2 h-3 w-3/5" /></div>
                    <Bone className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton({ title }: { title: string }) {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-[52px]" style={{ marginTop: 'var(--safe-top)' }} />
      <div className="mx-auto max-w-[640px] px-4">
        <h1 className="pb-4 text-large font-bold lg:text-title2">{title}</h1>
        <div className="mb-7 flex flex-col items-center rounded-group bg-cell py-8 shadow-card"><Bone className="h-12 w-40" /><Bone className="mt-4 h-7 w-28 rounded-[9px]" /></div>
        {[3, 1, 1, 1].map((n, s) => (
          <div key={s} className="mb-7 overflow-hidden rounded-group bg-cell shadow-card">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex h-[var(--row-h)] items-center justify-between px-4 hairline-b"><Bone className="h-3.5 w-20" /><Bone className="h-3.5 w-32" /></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
