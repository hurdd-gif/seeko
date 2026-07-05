export type PhaseLabel = 'Planned' | 'Alpha' | 'Beta' | 'Release';
export type PhaseState = 'done' | 'current' | 'upcoming';
export type PhaseStage = { label: PhaseLabel; state: PhaseState };

// The lifecycle a game moves through. `Launch` is the schema enum value,
// surfaced to users as "Release". `Planned` is not a phase — it's the
// pre-production state, derived from the area's status, that sits before Alpha.
const RAIL: PhaseLabel[] = ['Planned', 'Alpha', 'Beta', 'Release'];
const PHASE_ORDER = ['Alpha', 'Beta', 'Launch'] as const;

function rail(currentIdx: number): PhaseStage[] {
  return RAIL.map((label, i) => ({
    label,
    state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
  }));
}

// `status` (area_status: Planned | Active | Complete) takes precedence over
// `phase`: a preplanned game is before Alpha no matter what stale phase value
// is still on the row.
export function phaseTrack(
  phase?: string | null,
  status?: string | null,
): PhaseStage[] {
  const s = status?.toLowerCase();

  if (s === 'complete') return RAIL.map((label) => ({ label, state: 'done' }));
  // Preplanned: before Alpha. Nothing is reached yet, so nothing is highlighted
  // — the whole rail reads as upcoming, not "Planned current".
  if (s === 'planned') return RAIL.map((label) => ({ label, state: 'upcoming' }));

  const idx = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  if (idx < 0) return RAIL.map((label) => ({ label, state: 'upcoming' }));

  // RAIL is [Planned, Alpha, Beta, Release]; PHASE_ORDER maps to rail idx + 1.
  return rail(idx + 1);
}
