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

// ── Signer-ceremony phase swap (verify ↔ sign) ─────────────────
/**
 * Cross-blur phase swap for the external-signing ceremony's locked sheet,
 * used inside <AnimatePresence mode="wait">. It is the app's standard fade —
 * the FadeRise opacity+y rise on `springs.smooth`, as on /activity and
 * /settings — enriched with the transitions.dev "panel reveal" cross-blur:
 * a 2px blur on enter/exit so the swap reads as a real open even though the
 * compact verify panel and the taller sign panel are very different heights.
 * The blur masks that height jump (Emil: "blur masks imperfect transitions"),
 * and the exit accelerates out faster than the enter (transitions.dev: close
 * quicker than open).
 *
 * STORYBOARD (mode="wait" → old phase exits fully, then new phase enters):
 *   EXIT   opacity 1→0 · y 0→-6 · blur 0→2px   — 180ms accelerate-out
 *   ENTER  opacity 0→1 · y 8→0  · blur 2px→0    — springs.smooth (the app fade);
 *          blur rides its own 280ms ease-out so the spring can't pull it past 0
 *   reduced-motion → opacity-only 120ms, no y, no blur (matches MODAL.reduced)
 */
export const CEREMONY_SWAP = {
  enter: { opacity: 0, y: 8, filter: 'blur(2px)' },
  rest: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -6, filter: 'blur(2px)' },
  /** Blur on a clean ease-out — a spring would overshoot blur below 0 → flicker. */
  blurTransition: { duration: 0.28, ease: 'easeOut' as const },
  exitTransition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
  reduced: { duration: 0.12 },
} as const;

/**
 * Per-phase entrance props for the ceremony swap, reduced-motion aware.
 * Spread onto each phase's `motion.div` inside the locked sheet's
 * <AnimatePresence mode="wait">.
 */
export function ceremonySwap(reduce: boolean | null) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: CEREMONY_SWAP.reduced },
      transition: CEREMONY_SWAP.reduced,
    };
  }
  return {
    initial: CEREMONY_SWAP.enter,
    animate: CEREMONY_SWAP.rest,
    exit: { ...CEREMONY_SWAP.exit, transition: CEREMONY_SWAP.exitTransition },
    // opacity + y ride springs.smooth (the app fade); blur rides its own ease-out
    transition: { ...springs.smooth, filter: CEREMONY_SWAP.blurTransition },
  };
}
