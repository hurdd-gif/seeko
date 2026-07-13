import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * The seam for the public routes' cross-route motion (/login ⇄ /legal/*).
 *
 * WHY THE BROWSER AND NOT MOTION. The two pages are separate top-level routes
 * with no shared parent — the `PublicShell` that used to wrap them was removed
 * by user order — so nothing survives the route boundary, and an
 * `AnimatePresence` has nowhere to live. Which means the outgoing page can
 * never get an exit: React unmounts /login the instant /legal mounts. Browser
 * view transitions solve exactly this from *outside* React — the browser
 * snapshots the old page, swaps the DOM, then animates between the two
 * snapshots — with per-element control via `view-transition-name`. No shared
 * parent required. (The transition CSS lives in globals.css.)
 *
 * WHY THIS HOOK EXISTS. During a transition the live DOM is hidden and replaced
 * by a STILL IMAGE captured at the moment the DOM swap commits. So any JS
 * entrance animation on the *arriving* page is captured at its first frame: a
 * legal page whose sections start at `opacity: 0` snapshots as a blank column,
 * plays the entire transition blank, and only pops in once the browser hands
 * control back. The two entrances are therefore mutually exclusive by
 * construction — whichever navigation carries a transition must suppress the
 * page's mount-time storyboard, and the transition becomes the entrance.
 *
 * `location.key === 'default'` is React Router's marker for the first entry of
 * a fresh document — a cold load, a refresh, a deep link. Everything else is a
 * client-side navigation, which is precisely the set that can carry a
 * transition. POP counts: React Router replays a transition on back/forward for
 * any path pair it has already seen navigated with `viewTransition`, so the
 * back button out of /legal animates too, and its storyboard must stay skipped.
 *
 * The support check keeps the fallback honest. Where `startViewTransition` is
 * missing (Firefox), React Router does a plain instant swap — so there is no
 * transition to hand the entrance to, and the storyboard has to keep running or
 * the page would arrive with no motion at all.
 */
const SUPPORTED = typeof document !== 'undefined' && 'startViewTransition' in document;

const isLegal = (path: string) => path.startsWith('/legal');

/**
 * The path we were on last time a public route rendered. Module scope, not a
 * ref, because it has to outlive the component: the whole point is to know what
 * we came FROM, and by the time /login mounts, /legal has already unmounted.
 */
let previousPath: string | null = null;

/**
 * Runs on both public routes. Returns true when this mount is the far side of a
 * client-side navigation the browser will animate — callers use it to skip their
 * mount-time entrance — and, as a side effect, stamps the *kind* of navigation on
 * the document element so the CSS can tell the two apart.
 *
 * WHY THE STAMP. The doc-switcher pills and the tick rail persist across a
 * lateral swap (terms → privacy) but are solo on a crossing (login ⇄ legal), and
 * those two cases want opposite motion:
 *
 *   lateral   — the element is on screen before AND after, in the same place, so
 *               its old and new snapshots must cross-fade SIMULTANEOUSLY. Stagger
 *               them and the pill row dips to ~10% between the two: a tab strip
 *               that blinks when you press it reads as broken.
 *   crossing  — the element only exists on one side, so it must obey the same
 *               fade-through as the document it belongs to: out with it, in with
 *               it. Left on the simultaneous cross-fade it lands 100ms BEFORE the
 *               document arrives and lingers 80ms AFTER the document is gone —
 *               legal chrome ghosting over the sign-in panel.
 *
 * CSS has no selector for "does this group have both an old and a new snapshot",
 * so it cannot make that distinction on its own. React can: it knows the path we
 * came from. `[data-vt]` on the root is how it tells CSS.
 *
 * The timing works because the pseudo-element tree is built and styled AFTER the
 * DOM swap, and React Router performs that swap inside `flushSync` inside
 * `startViewTransition`'s callback — so a LAYOUT effect on the arriving route
 * lands inside the same callback, before the browser has styled a single pseudo.
 * A passive effect would be a frame too late. One stamp governs both the old and
 * the new pseudos of the transition, which is all we need: a given navigation is
 * either lateral or a crossing, never both.
 */
export function usePublicViewTransition(): boolean {
  const { key, pathname } = useLocation();

  useLayoutEffect(() => {
    const from = previousPath;
    previousPath = pathname;
    if (!SUPPORTED) return;
    const lateral = from !== null && isLegal(from) && isLegal(pathname);
    document.documentElement.dataset.vt = lateral ? 'lateral' : 'cross';
  }, [pathname]);

  // `[data-vt]` is a global attribute with exactly one owner — this hook — and it
  // means nothing off the public routes. Left behind, /tasks renders with a stale
  // `data-vt="cross"` forever and the next person to write a `[data-vt]` selector
  // inherits a lie. Unmount cleanup runs before the incoming route's layout
  // effects in the same commit, so a public → public navigation still gets its
  // fresh stamp; only a public → app exit actually clears it.
  useLayoutEffect(() => () => { delete document.documentElement.dataset.vt; }, []);

  return SUPPORTED && key !== 'default';
}
