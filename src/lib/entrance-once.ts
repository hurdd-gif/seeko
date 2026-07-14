import { useEffect, useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
 * One tab, one entrance.
 *
 * An entrance animation is a greeting: it earns its ~700ms the first time you
 * arrive and costs you that long every time after. Refresh the 404 four times
 * and you have watched the same sunset rise four times — which is how you find
 * out it is an animation and not a page.
 *
 * The gate is sessionStorage, not a module flag, because the thing being
 * defended against is a RELOAD (a fresh JS realm, where a module flag is born
 * empty). It is sessionStorage and not localStorage because the greeting should
 * come back tomorrow — the scope is the tab, which is the scope of a visit.
 *
 * WHY THIS FILE EXISTS. The key was a copy-pasted string literal in three
 * places (LoginForm, and HalftoneVeil twice), and only LoginForm ever WROTE it.
 * So the veil's skip was really "has the user visited /login in this tab?" —
 * true on login, false everywhere else the veil is mounted. The 404 imported
 * the veil and inherited a lock that could never engage. Ownership of the key
 * now sits with the thing the key is about.
 * ───────────────────────────────────────────────────────────────────────── */

export const ENTRANCE_KEYS = {
  /** The login card's staged storyboard (stage 0 → 5). */
  loginCard: 'seeko-login-entrance-played',
  /** The sunset veil's rise. Keyed to the VEIL, not to a page: it is one object
   *  mounted by both /login and the 404, so seeing it rise on either is seeing
   *  it rise. Previously this piggybacked on the login card's key, which meant
   *  a 404 → /login trip played the rise twice. */
  veil: 'seeko-veil-entrance-played',
  /** The 404's content stagger (numerals → headline → path → actions). */
  notFound: 'seeko-404-entrance-played',
  /** The 500's content stagger. Separate from the 404's: they are different
   *  pages, and hitting one is no reason to have seen the other. */
  serverError: 'seeko-500-entrance-played',
} as const;

/** Storage can throw outright (Safari private mode, a blocked third-party
 *  context), and a decorative animation is never worth a thrown page. Both
 *  helpers degrade to "play it, just don't remember it," which is the safe
 *  direction: a repeated entrance is a nuisance, a suppressed one on a first
 *  visit is a missing design. */
export function hasPlayedEntrance(key: string): boolean {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function markEntrancePlayed(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* Non-fatal — see above. */
  }
}

/**
 * True on the first mount of `key` in this tab, false forever after.
 *
 * The read happens in a useState INITIALIZER, not an effect, and that is the
 * whole trick: an effect runs after the first paint, so a component that asked
 * "have I played?" there would already have rendered one frame at `hidden` —
 * a flash of invisible content on precisely the visit that was supposed to skip
 * the animation. The answer has to be right before the first render, not after.
 */
export function useEntranceOnce(key: string): boolean {
  const [play] = useState(() => !hasPlayedEntrance(key));

  useEffect(() => {
    if (play) markEntrancePlayed(key);
  }, [play, key]);

  return play;
}
