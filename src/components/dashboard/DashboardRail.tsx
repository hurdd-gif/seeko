import type { ReactNode } from 'react';

export function DashboardRail({ children }: { children: ReactNode }) {
  return (
    <aside className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
      {children}
    </aside>
  );
}
