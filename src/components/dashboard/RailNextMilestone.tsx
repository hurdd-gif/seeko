import { soonestArea, monthsUntil } from '@/lib/areas';
import type { Area } from '@/lib/types';

export function RailNextMilestone({ areas, now = new Date() }: { areas: Area[]; now?: Date }) {
  const area = soonestArea(areas);

  if (!area || !area.target_date) {
    return (
      <div className="px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Next milestone</p>
        <p className="mt-1 text-sm text-muted-foreground">No target dates set</p>
      </div>
    );
  }

  const months = monthsUntil(area.target_date, now);
  const formatted = new Date(area.target_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-muted-foreground">Next milestone</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium text-foreground">
          {area.name}
          {area.phase && <span className="text-muted-foreground"> · {area.phase}</span>}
        </p>
        <p className="shrink-0 text-sm tabular-nums text-foreground">{months} mo</p>
      </div>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatted}</p>
    </div>
  );
}
