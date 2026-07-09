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

// ── Sliding tab pill (shared layoutId indicator) ───────────────
/**
 * Canonical spring for the sliding active-pill that glides between segments
 * of a segmented control (Documents/Decks/Shared, invoice expiry, payment
 * filters, …). SINGLE SOURCE OF TRUTH — every `layoutId` tab pill in the app
 * imports this so they all glide with the same feel.
 *
 * Slightly softer than a content slide (380/34 vs the typical 400/32) so the
 * chip glides UNDER the label rather than snapping ahead of it. Pair with
 * `initial={false}` (no entrance on first paint) and a unique `layoutId` per
 * control; under prefers-reduced-motion swap to `{ duration: 0 }` so the chip
 * jumps instantly instead of sliding.
 */
export const TAB_PILL_SPRING = { type: 'spring' as const, stiffness: 380, damping: 34 } as const;

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

// ── Dropdown / popover entrance ────────────────────────────────
/**
 * Canonical entrance for every menu/popover that hangs from the top bar
 * (account menu, Inbox dropdown). SINGLE SOURCE OF TRUTH — both consumers
 * derive from this so the connected pill→popover system enters as one
 * component, the same way `shadow-seeko` unified their elevation.
 *
 * Tuned for SNAP: a popover is a small surface and must feel instant
 * (Linear/Raycast territory, ~190ms), not a 320ms panel. Shell and rows
 * arrive together — content rides in 20ms behind the shell, so there is
 * no "panel opens … then fills" dead beat.
 *
 * STORYBOARD (ms after `open` becomes true):
 *     0ms   SHELL  opacity 0→1 · scale .96→1 · y −6→0
 *            origin top-right → unfurls from under the trigger
 *            spring: visualDuration .19 · bounce .08 (fast, hair of life)
 *    20ms   ROWS   opacity 0→1 · y 6→0, staggered 18ms, crisp 520/34
 *            → shell + content read as ONE arrival
 *   exit    SHELL only · opacity→0 · scale→.97 · y→−6 · 130ms ease-in
 *            (quieter/faster exit — rows do NOT re-stagger out)
 *   reduced-motion → SHELL opacity-only 110ms, no scale/y, no stagger
 */
export const DROPDOWN = {
  shell: {
    initial: { opacity: 0, scale: 0.96, y: -6 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: -6 },
    /** Enter: fast, near-critically-damped — snappy, never AI-bounce */
    spring: { type: 'spring' as const, visualDuration: 0.19, bounce: 0.08 },
    /** Exit: quieter + faster than enter, accelerate away */
    exitTransition: { duration: 0.13, ease: [0.4, 0, 1, 1] as const },
    transformOrigin: 'top right' as const,
  },
  row: {
    initial: { opacity: 0, y: 6 },
    /** Crisp, no overshoot — content snaps in cleanly with the shell */
    spring: { type: 'spring' as const, stiffness: 520, damping: 34 },
    stagger: 0.018, // s between rows — tight cascade, not a trickle
    baseDelay: 0.02, // s after shell — rides in with it, no dead beat
  },
  /** prefers-reduced-motion: opacity only, no transform, no stagger */
  reduced: { duration: 0.11 },
} as const;

/**
 * Shell entrance props for a dropdown/popover container, reduced-motion aware.
 * Spread onto the panel `motion.div`. Shared by the account menu and the
 * Inbox dropdown so the connected system enters identically.
 */
export function shellEntrance(reduce: boolean | null) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: DROPDOWN.reduced },
      transition: DROPDOWN.reduced,
    };
  }
  return {
    initial: DROPDOWN.shell.initial,
    animate: DROPDOWN.shell.animate,
    exit: { ...DROPDOWN.shell.exit, transition: DROPDOWN.shell.exitTransition },
    transition: DROPDOWN.shell.spring,
  };
}

/**
 * Per-row entrance props (interior cascade), reduced-motion aware.
 * `index` is the row's position; the stagger delay is derived from it.
 */
export function rowEntrance(index: number, reduce: boolean | null) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: DROPDOWN.reduced,
    };
  }
  return {
    initial: DROPDOWN.row.initial,
    animate: { opacity: 1, y: 0 },
    transition: {
      ...DROPDOWN.row.spring,
      delay: DROPDOWN.row.baseDelay + index * DROPDOWN.row.stagger,
    },
  };
}

// ── Modal entrance ─────────────────────────────────────────────
/**
 * Canonical entrance for centered modal dialogs (Create Task, future
 * modal forms). SINGLE SOURCE OF TRUTH — backdrop + card coordinate
 * so the surface arrives as one piece, not two competing animations.
 *
 * Modal sizing principle: a modal is a larger surface than a popover,
 * so it earns a hair more weight (visualDuration .22 vs .19) but still
 * has to feel deliberate, not leisurely. Tighter scale (0.97) keeps
 * the card anchored — no "drop-in zoom" feel.
 *
 * STORYBOARD (ms after open/close):
 *   OPEN
 *     0ms   BACKDROP  opacity 0→1 over 180ms ease-out
 *           CARD      opacity 0→1 · scale .97→1 (no y — center anchor)
 *                     spring: visualDuration .22 · bounce .10
 *   CLOSE — card LEADS, backdrop TRAILS (the inverse of open)
 *     0ms   CARD      scale 1→.94 · opacity 1→0, 160ms ease-in
 *                     (perceivable recede — surface "leaves the screen")
 *    60ms   BACKDROP  opacity 1→0, 160ms ease-in
 *                     (dim resolves AFTER the card has visibly departed,
 *                      so the page is revealed at the right moment)
 *   reduced-motion → opacity-only 120ms throughout, no scale, no blur,
 *                     no exit trail (backdrop + card resolve together).
 */
export const MODAL = {
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    enterTransition: { duration: 0.18, ease: 'easeOut' as const },
    /** Exit TRAILS the card by 60ms — page reveal lands after card departs. */
    exitTransition: { duration: 0.16, delay: 0.06, ease: [0.4, 0, 1, 1] as const },
  },
  card: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    /** Exit recedes meaningfully (~27px edge shift on a 448px surface) —
     *  no more barely-there scale .98 flicker. Backdrop trails this. */
    exit: { opacity: 0, scale: 0.94 },
    /** Enter: damped spring, hair of life — modal-weight (slower than popover) */
    spring: { type: 'spring' as const, visualDuration: 0.22, bounce: 0.1 },
    /** Exit: accelerate-out, card leads the dismissal */
    exitTransition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
    transformOrigin: 'center' as const,
  },
  /** prefers-reduced-motion: opacity only, no scale, no blur fade, no trail */
  reduced: { duration: 0.12 },
} as const;

/**
 * Backdrop entrance props for a centered modal, reduced-motion aware.
 * Spread onto the backdrop `motion.div`.
 */
export function modalBackdropEntrance(reduce: boolean | null) {
  const reduced = reduce ? MODAL.reduced : null;
  return {
    initial: MODAL.backdrop.initial,
    animate: MODAL.backdrop.animate,
    exit: {
      ...MODAL.backdrop.exit,
      transition: reduced ?? MODAL.backdrop.exitTransition,
    },
    transition: reduced ?? MODAL.backdrop.enterTransition,
  };
}

/**
 * Card entrance props for a centered modal, reduced-motion aware.
 * Spread onto the modal card `motion.div`.
 */
export function modalCardEntrance(reduce: boolean | null) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: MODAL.reduced },
      transition: MODAL.reduced,
    };
  }
  return {
    initial: MODAL.card.initial,
    animate: MODAL.card.animate,
    exit: { ...MODAL.card.exit, transition: MODAL.card.exitTransition },
    transition: MODAL.card.spring,
  };
}

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

// ── Ring hover tooltip (Overview progress ring → "Health by area") ──
/**
 * Entrance for the per-area health card that reveals on hover/focus of the
 * Overview progress ring. Unlike DROPDOWN (which hangs DOWN from the top bar,
 * origin top-right), this card sits ABOVE the ring and must read as POPPING UP
 * OUT OF the ring — so it scales from its `bottom center` (the edge nearest the
 * ring) and rises the last few px into place. Same snap as the app's other
 * popovers, so the connected system feels of-a-piece.
 *
 * The card is ALWAYS mounted — it is the ring's `aria-describedby` target, so
 * SR / keyboard users always reach it. So this is a VARIANT toggle driven by an
 * `open` boolean, NOT AnimatePresence. `initial={false}` rests it hidden on
 * first paint (no entrance on load).
 *
 * STORYBOARD (ms after hover/focus):
 *     0ms   SHELL  opacity 0→1 · scale .96→1 · y 6→0
 *            origin bottom-center → unfurls UP out of the ring
 *            spring: visualDuration .18 · bounce .06 (instant, hair of life)
 *    40ms   ROWS   opacity 0→1 · y 5→0, staggered 20ms, crisp 520/34
 *            → card + content read as ONE arrival
 *   exit    SHELL only · opacity→0 · scale→.96 · y→6 · 120ms accelerate-out
 *            (quieter + faster than enter; rows snap back invisibly, no re-stagger)
 *   reduced-motion → opacity-only 120ms, no scale/y, no stagger
 */
export const RING_TOOLTIP = {
  shell: {
    hidden: { opacity: 0, scale: 0.96, y: 6 },
    shown: { opacity: 1, scale: 1, y: 0 },
    /** Enter: fast, near-critically-damped — matches the popover system */
    spring: { type: 'spring' as const, visualDuration: 0.18, bounce: 0.06 },
    /** Exit: quieter + faster than enter, accelerate away */
    exitTransition: { duration: 0.12, ease: [0.4, 0, 1, 1] as const },
    transformOrigin: 'bottom center' as const,
  },
  row: {
    hidden: { opacity: 0, y: 5 },
    shown: { opacity: 1, y: 0 },
    /** Crisp, no overshoot — rows snap in cleanly behind the shell */
    spring: { type: 'spring' as const, stiffness: 520, damping: 34 },
    stagger: 0.02, // s between rows — tight cascade
    baseDelay: 0.04, // s after shell — rides in just behind it
    /** Close: snap back invisibly under the shell fade, no re-stagger */
    exitTransition: { duration: 0.1 },
  },
  reduced: { duration: 0.12 },
} as const;

/**
 * Variant set for the ring hover tooltip, reduced-motion aware. Returns three
 * variant objects keyed by the `open` label ("shown" | "hidden"):
 *   - `shell` — the card (opacity/scale/y, origin bottom-center)
 *   - `list`  — stagger orchestrator for the <ul> (no visual props of its own)
 *   - `row`   — each area line
 * Wire as:
 *   <motion.div variants={shell} initial={false} animate={open?'shown':'hidden'}
 *               style={{ transformOrigin: RING_TOOLTIP.shell.transformOrigin }} />
 *     <motion.ul variants={list} initial={false} animate={open?'shown':'hidden'}>
 *       <motion.li variants={row} />   // inherits the label from the <ul>
 */
export function ringTooltip(reduce: boolean | null) {
  if (reduce) {
    return {
      shell: {
        hidden: { opacity: 0 },
        shown: { opacity: 1, transition: RING_TOOLTIP.reduced },
      },
      list: { hidden: {}, shown: {} },
      row: {
        hidden: { opacity: 0 },
        shown: { opacity: 1, transition: RING_TOOLTIP.reduced },
      },
    };
  }
  return {
    shell: {
      hidden: { ...RING_TOOLTIP.shell.hidden, transition: RING_TOOLTIP.shell.exitTransition },
      shown: { ...RING_TOOLTIP.shell.shown, transition: RING_TOOLTIP.shell.spring },
    },
    list: {
      hidden: {},
      shown: {
        transition: {
          staggerChildren: RING_TOOLTIP.row.stagger,
          delayChildren: RING_TOOLTIP.row.baseDelay,
        },
      },
    },
    row: {
      hidden: { ...RING_TOOLTIP.row.hidden, transition: RING_TOOLTIP.row.exitTransition },
      shown: { ...RING_TOOLTIP.row.shown, transition: RING_TOOLTIP.row.spring },
    },
  };
}
