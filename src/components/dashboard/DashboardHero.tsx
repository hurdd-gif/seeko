import { StatPills } from './StatPills';

type Pill = { label: string; count: number; variant: 'danger' | 'accent' | 'muted'; href?: string };

function greetingPrefix(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardHero({
  firstName,
  subline,
  pills,
  now = new Date(),
  pillDelayMs = 0,
  pillStaggerMs = 0,
}: {
  firstName?: string;
  subline: string;
  pills: Pill[];
  now?: Date;
  pillDelayMs?: number;
  pillStaggerMs?: number;
}) {
  const name = firstName ?? 'there';
  const prefix = greetingPrefix(now.getHours());
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-balance text-4xl font-medium tracking-tight text-foreground md:text-5xl">
          {prefix}, {name}
        </h1>
        {subline && <p className="mt-1 text-sm text-muted-foreground">{subline}</p>}
      </div>
      <StatPills pills={pills} delayMs={pillDelayMs} staggerMs={pillStaggerMs} />
    </div>
  );
}
