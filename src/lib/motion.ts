/**
 * Shared motion config for task/handoff UI.
 * Single vocabulary: one spring for panels, one for state changes.
 * Ref: interface-craft (storyboard, tunable constants), Impeccable (consistent design language).
 *
 * STORYBOARD (read top-to-bottom):
 *   Panels (handoff history overlay):
 *     - Backdrop: opacity 0 → 1 over DURATION_BACKDROP_MS
 *     - Card: scale 0.97 → 1, opacity 0 → 1 with PANEL_SPRING
 *   Buttons (handoff CTA state changes):
 *     - Icon/label: opacity crossfade over DURATION_STATE_MS (no y bounce for readability)
 *     - Button bg/scale: PANEL_SPRING (same as panels for consistency)
 */

export const DURATION_BACKDROP_MS = 180;
export const DURATION_STATE_MS = 200;

/** One spring for overlays and panels — smooth, no bounce. */
export const PANEL_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
};

/** Same as PANEL_SPRING so all task UI motion feels consistent. */
export const BUTTON_SPRING = PANEL_SPRING;

export const PANEL = {
  backdropOpacity: { closed: 0, open: 1 },
  cardScale: { closed: 0.97, open: 1 },
  cardOpacity: { closed: 0, open: 1 },
} as const;
