import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionEyebrow } from './SectionEyebrow';

export function SplitPanel({
  icon,
  eyebrow,
  left,
  right,
}: {
  icon: LucideIcon;
  eyebrow: string;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <section>
      <SectionEyebrow icon={icon}>{eyebrow}</SectionEyebrow>
      <div className="grid grid-cols-[minmax(220px,280px)_1fr] gap-px overflow-hidden rounded-xl bg-[var(--color-glass)] backdrop-blur-[48px]">
        <div className="p-6">{left}</div>
        <div className="p-6">{right}</div>
      </div>
    </section>
  );
}
