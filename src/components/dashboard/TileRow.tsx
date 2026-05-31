import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionEyebrow } from './SectionEyebrow';

export function TileRow({
  icon,
  eyebrow,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section>
      <SectionEyebrow icon={icon}>{eyebrow}</SectionEyebrow>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
        {children}
      </div>
    </section>
  );
}
