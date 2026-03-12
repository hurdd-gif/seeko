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
    swipeThreshold: 130,
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
