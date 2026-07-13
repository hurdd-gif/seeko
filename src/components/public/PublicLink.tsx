import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useLocation } from 'react-router';

/**
 * The link primitive for the public routes (/login ⇄ /legal/*).
 *
 * THE PROBLEM IT SOLVES. Both public routes are lazy chunks, and neither of them
 * acknowledged a click. Measured on a cold /login: 150ms after pressing "Terms of
 * Use", nothing whatsoever had changed on screen — no press state, no cue, no
 * motion. The user has already decided; the interface hasn't reacted yet. That's
 * the moment an app stops feeling direct, and no amount of polish on the
 * transition that eventually plays can buy it back.
 *
 * Two fixes, and they work as a pair:
 *
 *   1. WARM THE CHUNK ON INTENT, so the cold click mostly stops existing. Hover,
 *      focus, and touch-down all precede the click by 80ms+ — enough to fetch a
 *      route chunk over any connection worth prefetching on. A mouse user hovers
 *      before clicking; a keyboard user tabs before pressing Enter; `pointerenter`
 *      fires at touch-DOWN, so a phone gets the head start too.
 *
 *   2. HOLD THE PRESS UNTIL THE PAGE ACTUALLY LEAVES, for the clicks that are
 *      still cold. `:active` alone is not enough here: it drops the instant the
 *      pointer lifts, which on a lazy route is *before* anything has happened, so
 *      the interface would flicker and then go dead again. The pending flag keeps
 *      the pressed look on screen for exactly as long as the wait lasts.
 *
 * Call sites own the look. This stamps `data-pending` and pairs with the site's
 * own `active:` classes so the two states render identically — the press begins
 * in CSS at zero latency and the flag simply refuses to let it end early. One
 * continuous gesture, not two states that happen to look alike.
 */

/**
 * The lazy chunk behind each public path prefix.
 *
 * These specifiers resolve to the same module ids the router's own `lazy()` uses
 * (`routes.tsx` imports `./routes/legal`; this imports `@/rr-app/routes/legal` —
 * same file, so one resolved id, one chunk). The ESM registry dedupes them, which
 * is the whole trick: this is a warm-up of the router's chunk, not a second copy
 * of the route.
 */
const CHUNKS: Record<string, () => Promise<unknown>> = {
  '/login': () => import('@/rr-app/routes/login'),
  '/legal': () => import('@/rr-app/routes/legal'),
};

/**
 * Raise a control to the 44px touch minimum WITHOUT moving a visible pixel.
 *
 * The public routes are the one place in the app a phone is guaranteed to land —
 * an invite email opens on a phone — and every control on them was under the
 * floor: the doc-switcher pills 32px, the chrome links 24px, the footer link
 * 20px. A 20px target is a coin-flip under a thumb.
 *
 * It's a centered overlay rather than `min-h-11` because these sit in
 * content-height flex bars: growing the link would grow the header around it.
 * The pseudo-element takes the press (pseudo-elements inherit `pointer-events`,
 * so a click on it fires the anchor) and costs no layout at all.
 *
 * `inset-x-0` — vertical only. Every one of these controls is already far wider
 * than 44px, and widening them would push neighbours' hit areas into each other,
 * which is the failure this rule exists to prevent in the first place.
 *
 * NOT for inline links inside a paragraph: there, the extension would overlap
 * the lines of prose above and below, and the ambiguity is worse than the small
 * target. Those keep their text-sized box (see FOOTNOTE_LINK in login.tsx).
 */
export const TOUCH_TARGET =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";

const warmed = new Set<string>();

function warm(to: string) {
  // Don't spend someone's metered data on a page they haven't asked for. Data
  // Saver is an explicit request to stop doing exactly this.
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;

  const prefix = Object.keys(CHUNKS).find(p => to.startsWith(p));
  if (!prefix || warmed.has(prefix)) return;
  warmed.add(prefix);
  // A failed prefetch is not a failure — the router will import the chunk again
  // on navigation and surface any real error there, where it can be handled.
  CHUNKS[prefix]().catch(() => warmed.delete(prefix));
}

type PublicLinkProps = Omit<ComponentProps<typeof Link>, 'to' | 'viewTransition'> & {
  to: string;
};

export function PublicLink({ to, onPointerEnter, onFocus, onClick, ...rest }: PublicLinkProps) {
  const { key } = useLocation();
  const [pending, setPending] = useState(false);

  // Clear on ARRIVAL, not on unmount. Crossing to /legal unmounts this link and
  // the flag dies with it — but the doc-switcher pills survive a lateral swap
  // (terms → privacy) and would otherwise stay stuck in the pressed look forever.
  // `key` changes on every navigation, including the one that lands us right back
  // where we started.
  useEffect(() => {
    setPending(false);
  }, [key]);

  return (
    <Link
      viewTransition
      to={to}
      data-pending={pending || undefined}
      onPointerEnter={e => {
        warm(to);
        onPointerEnter?.(e);
      }}
      onFocus={e => {
        warm(to);
        onFocus?.(e);
      }}
      onClick={e => {
        setPending(true);
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
