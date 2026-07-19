import type { Milestone, MilestoneHealth } from '@/lib/types';

// Worst-of severity order: a single off-track milestone drags the whole area to
// off_track, so the Progress card surfaces risk first instead of averaging it away.
// Completed ranks below on_track — an area reads "Completed" only when every
// signal-carrying milestone has landed.
const RANK: Record<MilestoneHealth, number> = {
  completed: 0,
  on_track: 1,
  at_risk: 2,
  off_track: 3,
};

// Roll a set of milestone health signals up to one. off_track > at_risk >
// on_track; entries without a health (null/undefined) are ignored. Returns null
// when nothing carries a signal.
export function rollupHealth(
  healths: Array<MilestoneHealth | null | undefined>,
): MilestoneHealth | null {
  let worst: MilestoneHealth | null = null;
  for (const h of healths) {
    if (!h) continue;
    if (worst === null || RANK[h] > RANK[worst]) worst = h;
  }
  return worst;
}

// Key milestone health by normalized milestone name, rolling duplicates up
// worst-of. Areas aren't linked to milestones in the data; instead each area
// carries a `phase` (Alpha/Beta/Launch) and the milestones are named after the
// phases (ALPHA/BETA). The Progress card relays health by matching an area's
// phase to the like-named milestone — so the map is keyed by trimmed/lowercased
// milestone name and looked up with the area's phase. Names that carry no
// health signal are omitted (the row then shows no badge, not a false default).
export function phaseHealthMap(milestones: Milestone[]): Map<string, MilestoneHealth> {
  const byName = new Map<string, Array<MilestoneHealth | null | undefined>>();
  for (const m of milestones) {
    const key = m.name?.trim().toLowerCase();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(m.health);
    byName.set(key, list);
  }
  const out = new Map<string, MilestoneHealth>();
  for (const [name, healths] of byName) {
    const h = rollupHealth(healths);
    if (h) out.set(name, h);
  }
  return out;
}
