import type { Area } from '@/lib/types';

export function RailStudioProgress({ areas }: { areas: Area[] }) {
  if (areas.length === 0) {
    return (
      <div className="px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Studio progress</p>
        <p className="mt-1 text-sm text-muted-foreground">No active areas</p>
      </div>
    );
  }
  const avg = Math.round(areas.reduce((sum, a) => sum + a.progress, 0) / areas.length);
  const active = areas.filter((a) => a.status === 'Active').length;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">Studio progress</p>
        <p className="text-sm font-medium tabular-nums text-foreground">{avg}%</p>
      </div>
      <div
        className="mt-2 h-[3px] w-full overflow-hidden bg-muted"
        style={{ borderRadius: 'var(--radius-pill)' }}
        role="progressbar"
        aria-valuenow={avg}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[color:var(--color-status-complete)]"
          style={{ width: `${avg}%`, borderRadius: 'var(--radius-pill)' }}
        />
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        {active} active area{active === 1 ? '' : 's'}
      </p>
    </div>
  );
}
