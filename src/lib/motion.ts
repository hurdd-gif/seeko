/**
 * Shared motion config — canonical spring library for all SEEKO Studio UI.
 *
 * Import `springs` for animation transitions instead of defining inline configs.
 *
 * STORYBOARD (read top-to-bottom):
 *   Panels (handoff history overlay):
 *     - Backdrop: opacity 0 → 1 over DURATION_BACKDROP_MS
 *     - Card: scale 0.97 → 1, opacity 0 → 1 with springs.firm
 *   Buttons (handoff CTA state changes):
 *     - Icon/label: opacity crossfade over DURATION_STATE_MS (no y bounce for readability)
 *     - Button bg/scale: springs.firm (same as panels for consistency)
 */

// ── Canonical spring library ───────────────────────────────────
/** Import these instead of defining inline spring configs. */
export const springs = {
  /** Buttons, toggles, micro-interactions (500/30) */
  snappy: { type: 'spring' as const, stiffness: 500, damping: 30 },
  /** Content transitions, fades (300/25) */
  smooth: { type: 'spring' as const, stiffness: 300, damping: 25 },
  /** Panels, overlays, slideouts (400/30) */
  firm: { type: 'spring' as const, stiffness: 400, damping: 30 },
  /** Progress bars, slow reveals (200/20) */
  gentle: { type: 'spring' as const, stiffness: 200, damping: 20 },
  /** Collapse/expand with deliberate weight (360/39, mass 2.4) */
  heavy: { type: 'spring' as const, stiffness: 360, damping: 39, mass: 2.4 },
} as const;

// ── Duration constants ─────────────────────────────────────────
export const DURATION_BACKDROP_MS = 180;
export const DURATION_STATE_MS = 200;

// ── Aliases (backward-compatible) ──────────────────────────────
/** @deprecated Use `springs.firm` directly */
export const PANEL_SPRING = springs.firm;
/** @deprecated Use `springs.firm` directly */
export const BUTTON_SPRING = springs.firm;
/** @deprecated Use `springs.firm` directly */
export const SLIDEOUT_SPRING = springs.firm;

// ── Panel animation values ─────────────────────────────────────
export const PANEL = {
  backdropOpacity: { closed: 0, open: 1 },
  cardScale: { closed: 0.97, open: 1 },
  cardOpacity: { closed: 0, open: 1 },
} as const;

/** Slide-out panel — slides in from right edge. */
export const SLIDEOUT = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
} as const;
