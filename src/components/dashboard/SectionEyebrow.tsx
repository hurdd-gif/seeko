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
    <div className="flex h-8 items-center gap-2 pb-3.5 pl-2">
      <Icon className="size-4 shrink-0 text-[var(--ov-eyebrow)]" strokeWidth={2} aria-hidden />
      <span className="text-[12px] font-medium leading-[150%] text-[var(--ov-eyebrow)]">
        {children}
      </span>
    </div>
  );
}
