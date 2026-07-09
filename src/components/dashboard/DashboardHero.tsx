import { FadeRise } from '@/components/motion';

// Hero greeting + date subtitle. Left-aligned to the column's x=0 edge
// (deliberate cohesion override — see overview-first-pass memory). The two
// lines split-and-stagger in: heading at 0ms, subtitle 80ms behind, with a
// lighter rise so the secondary line settles after the greeting.
export function DashboardHero({
  greeting,
  name,
  dateLabel,
}: {
  greeting: string;
  name: string;
  dateLabel: string;
}) {
  return (
    <header className="flex flex-col gap-2 pt-16">
      <FadeRise delay={0} y={20}>
        <h1 className="text-balance text-[30px] font-semibold leading-[120%] text-[var(--ov-heading)]">
          {greeting}, {name}
        </h1>
      </FadeRise>
      <FadeRise delay={0.08} y={12}>
        <p className="text-[14px] leading-[120%] tabular-nums text-[var(--ov-muted)]">
          {dateLabel}
        </p>
      </FadeRise>
    </header>
  );
}
