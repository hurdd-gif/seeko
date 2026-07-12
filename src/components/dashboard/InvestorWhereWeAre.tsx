'use client';

import { Stagger, StaggerItem } from '@/components/motion';
import type { Area } from '@/lib/types';

interface InvestorWhereWeAreProps {
  areas: Area[];
  tasksPerArea?: Record<string, { complete: number; total: number }>;
}

export function InvestorWhereWeAre({ areas, tasksPerArea = {} }: InvestorWhereWeAreProps) {
  if (areas.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl bg-surface-1 p-6 shadow-seeko">
        <p className="text-[13px] font-medium leading-[18px] text-[var(--ov-muted)]">Where we are</p>
        <p className="mt-3 text-[14px] leading-[20px] text-[var(--ov-text)]">
          Progress areas will appear here once the team shares them.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface-1 p-6 shadow-seeko">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium leading-[18px] text-[var(--ov-muted)]">Where we are</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-[24px] text-ink-title">
            Current build progress
          </h2>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-[var(--ov-muted)]">
          {areas.length} {areas.length === 1 ? 'area' : 'areas'}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {areas.length > 3 ? (
          <Stagger className="flex flex-col gap-5">
            {areas.map((area) => (
              <StaggerItem key={area.id}>
                <AreaProgressRow area={area} tasks={tasksPerArea[area.id]} />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <div className="flex flex-col gap-5">
            {areas.map((area) => (
              <AreaProgressRow key={area.id} area={area} tasks={tasksPerArea[area.id]} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Compute whole months between now and a YYYY-MM-DD target date.
 * Returns null if no date. Mirrors the calc in investor/page.tsx so the bar
 * row's "ships in Xmo" stays in lockstep with the KPI strip's "next ship".
 */
function monthsUntil(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const [y, m, d] = targetDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const ms = new Date(y, m - 1, d).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24 * 30)));
}

function AreaProgressRow({
  area,
  tasks,
}: {
  area: Area;
  tasks: { complete: number; total: number } | undefined;
}) {
  const pct = area.progress ?? 0;
  const tasksTotal = tasks?.total ?? 0;
  const tasksComplete = tasks?.complete ?? 0;
  const months = monthsUntil(area.target_date);

  const hasTasks = tasksTotal > 0;
  const hasMonths = months !== null;
  const hasContext = hasTasks || hasMonths;

  return (
    <div className="rounded-xl bg-surface-3 px-4 py-3.5 shadow-[0_0_0_1px_rgba(0,0,0,0.035)]">
      {/* Layer 1 — identity: name (left) · phase chip (right) */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[14px] font-medium leading-[18px] text-ink-title">{area.name}</span>
        {area.phase && (
          <span className="shrink-0 text-[12px] leading-[18px] text-[var(--ov-muted)]">
            {area.phase}
          </span>
        )}
      </div>

      {/* Layer 2 — bar + percentage */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wash-8">
          <div
            className="h-full rounded-full bg-[color:var(--color-seeko-accent)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="min-w-[3ch] text-right text-[12px] tabular-nums text-[var(--ov-muted)]">
          {pct}%
        </span>
      </div>

      {/* Layer 3 — conditional context: tasks · monthsOut */}
      {hasContext && (
        <p className="mt-2 text-[12px] leading-[16px] tabular-nums text-[var(--ov-muted)]">
          {hasTasks && `${tasksComplete} of ${tasksTotal} tasks`}
          {hasTasks && hasMonths && ' · '}
          {hasMonths && `ships in ${months}mo`}
        </p>
      )}
    </div>
  );
}
