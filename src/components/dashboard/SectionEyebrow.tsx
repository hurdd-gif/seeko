import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionEyebrow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="ml-2 flex h-8 items-center gap-2 pb-3.5">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="text-xs font-medium leading-[150%] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}
