'use client';

/* ─────────────────────────────────────────────────────────
 * Notification animation constants (tuned via DialKit)
 * ───────────────────────────────────────────────────────── */

export const DIALS = {
  bell: {
    hoverScale: 1.1,
    tapScale: 0.77,
    spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
  },
  panel: {
    spring: { type: 'spring' as const, visualDuration: 0.45, bounce: 0.45 },
    initialScale: 0.91,
    initialY: -9,
    rowStagger: 0.05,
  },
  card: {
    spring: { type: 'spring' as const, visualDuration: 0.5, bounce: 0.4 },
    entranceY: 20,
    exitX: 80,
    exitScale: 0.88,
    swipeThreshold: 130, // kept for backwards compat but superseded by swipe config
  },
  swipe: {
    spring: { stiffness: 900, damping: 80 },
    /** Fraction of card width — release above this snaps to 50% revealing actions */
    partialThreshold: 0.25,
    /** Fraction of card width — swipe past this locks to edge, commits on release */
    fullThreshold: 0.8,
    /** Fraction of card width to snap to when partially revealed */
    partialSnap: 0.5,
    /** Colors for dismiss (right swipe) */
    dismissBg: 'rgba(239,68,68,0.12)',
    dismissBgFull: 'rgba(239,68,68,0.3)',
    /** Colors for mark-read (left swipe) */
    readBg: 'rgba(110,231,183,0.12)',
    readBgFull: 'rgba(110,231,183,0.3)',
    /** Squish animation on full-swipe commit */
    commitScaleY: 1.05,
    commitScaleX: 0.95,
    commitY: -24,
    /** Delay before reset after commit animation */
    commitResetDelay: 0.3,
  },
  stack: {
    spring: { type: 'spring' as const, stiffness: 600, damping: 50 },
    cardGap: 6,
    scaleStep: 0.05,
    opacityStep: 0.35,
    expandStagger: 0.04,
    collapseStagger: 0.03,
    collapsedPeek: 10,
    badgeMorphDuration: 0.15,
  },
};

export type NotificationDials = typeof DIALS;

export function useDials(): NotificationDials {
  return DIALS;
}
