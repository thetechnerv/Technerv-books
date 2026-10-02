import type { ReactNode } from 'react';

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      {icon && <div className="mb-3 text-label-3 [&_svg]:size-11 [&_svg]:stroke-[1.4]">{icon}</div>}
      <p className="text-title3 font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-sm text-subhead text-label-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
