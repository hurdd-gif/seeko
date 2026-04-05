type ProgressCarrier = { progress: number };

/**
 * Compute an area's progress as the rounded average of its sections' progress.
 * Returns 0 for an empty list. Clamps the result to 0-100.
 *
 * This mirrors the DB trigger's behavior so the client can optimistically
 * update the area progress bar as section inputs change.
 */
export function computeAreaProgress(sections: ProgressCarrier[]): number {
  if (sections.length === 0) return 0;
  const sum = sections.reduce((acc, s) => acc + s.progress, 0);
  const avg = Math.round(sum / sections.length);
  return Math.max(0, Math.min(100, avg));
}
