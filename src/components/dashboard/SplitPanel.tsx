import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionEyebrow } from './SectionEyebrow';

// 1:1 with the mockup: a FIXED 168px-tall clipped section holding two absolute
// siblings — the eyebrow nudged to y=-3 and a 132px card pinned at y=29. The
// card is positioned (not flowed after) so the eyebrow's 14px bottom padding is
// overlapped, collapsing the eyebrow→card gap to the mockup's ~16px instead of
// the ~30px a flowed eyebrow+card would stack to.
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
    <section className="relative h-[168px] min-w-0 flex-1 overflow-clip">
      <div className="absolute -top-[3px] left-0 right-0">
        <SectionEyebrow icon={icon}>{eyebrow}</SectionEyebrow>
      </div>
      <div className="absolute inset-x-0 top-[29px] flex h-[132px] overflow-clip rounded-[30px] bg-[#ffffffe6] shadow-[var(--ov-shadow-panel)]">
        <div className="flex h-[114px] flex-1 basis-1/2 flex-col items-center justify-between bg-[var(--ov-panel)] p-6">
          {left}
        </div>
        <div className="flex flex-1 basis-1/2 flex-col items-start justify-center gap-2.5 border-l border-[var(--ov-hairline)] bg-[var(--ov-panel)] p-6">
          {right}
        </div>
      </div>
    </section>
  );
}
