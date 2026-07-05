import type { Area } from '@/lib/types';

// Mean per-area completion, rounded to a whole percent. This is the single
// headline the Overview ring renders ("X% Overall"). Empty studio → 0 (no
// divide-by-zero). Shared with StudioOverviewPanel so the ring and the legacy
// list agree by construction.
export function overallProgress(areas: Area[]): number {
  if (areas.length === 0) return 0;
  return Math.round(areas.reduce((sum, a) => sum + a.progress, 0) / areas.length);
}

// Stable display order: by target_date ascending (dated areas first), then by
// sort_order. Returns a new array — never mutates the input.
export function orderAreas(areas: Area[]): Area[] {
  return [...areas].sort((a, b) => {
    if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
    if (a.target_date) return -1;
    if (b.target_date) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}
