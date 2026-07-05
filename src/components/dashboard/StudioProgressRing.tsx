import type { Area, Milestone } from '@/lib/types';
import { phaseHealthMap } from './areaHealth';
import { orderAreas, overallProgress } from './studioProgress';
import { ProgressRing, type RingAreaHealth } from './ProgressRing';

// Server wrapper for the Overview progress ring. Computes the same rollup the
// old StudioOverviewPanel did — mean per-area progress + per-area health relayed
// from the like-named phase milestone (worst-of) — then hands the plain data to
// the client ring. Replaces the Progress areas-list panel on the Overview page.
export function StudioProgressRing({
  areas,
  milestones = [],
  isAdmin = false,
}: {
  areas: Area[];
  milestones?: Milestone[];
  /** Admins can edit area progress by clicking the ring (opens a stacked editor). */
  isAdmin?: boolean;
}) {
  const overall = overallProgress(areas);
  const healthByPhase = phaseHealthMap(milestones);

  const areaHealth: RingAreaHealth[] = orderAreas(areas).map((a) => ({
    id: a.id,
    name: a.name,
    health: a.phase ? healthByPhase.get(a.phase.trim().toLowerCase()) ?? null : null,
  }));

  return (
    <ProgressRing
      overall={overall}
      areas={areaHealth}
      isAdmin={isAdmin}
      editableAreas={isAdmin ? orderAreas(areas) : []}
    />
  );
}
