import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { ENTRANCE_KEYS } from '@/lib/entrance-once';
import { BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { TOUCH_TARGET } from '@/components/public/PublicLink';
import { SunsetErrorPage } from '@/components/public/SunsetErrorPage';

/* ─────────────────────────────────────────────────────────────────────────
 * 404 — the sunset, twice.
 *
 *   The page itself lives in <SunsetErrorPage>, which the 500 shares: the
 *   gradient-clipped mark over the halftone veil, the once-per-tab stagger,
 *   the copyable mono line, the single primary. Read that file for the why of
 *   any of it. What is 404-specific is here, and it is three decisions.
 *
 *   WHY IT REPLACED THE OLD PAGE. The previous 404 was a black canvas with a
 *   magnetic dot-grid: dots on the glyphs sat at alpha 0.32, radius 1.2px, in
 *   #0e7aff on #000. Screenshotted at rest, the numerals were not visible —
 *   they resolved only if the cursor happened to sweep through them, and
 *   nothing on the page invited that. A 404 whose 404 you cannot see is a
 *   structural failure. It was also the product's only pure-black surface, in
 *   an app whose login, legal, docs and dashboard are all Paper light.
 * ───────────────────────────────────────────────────────────────────────── */

export function NotFoundRoute() {
  return <NotFoundContent />;
}

export function NotFoundContent() {
  const { pathname } = useLocation();

  return (
    <SunsetErrorPage
      mark="404"
      /* Plain and first-person, on purpose. Two wittier drafts died here: calling
         the page a *skybox* (a joke you have to work in games to get — a wink at
         ourselves, not a line for someone who is lost) and "pardon the empty lot"
         (borrowed signage, but that idiom promises a building is coming, and none
         is). The stock sentence — "the link may be broken, or the page may have
         moved," which Assembly, SeatGeek, Quartz, Unsplash and HODINKEE all ship
         near word for word — was never in the running. "We" is what makes this
         ours: someone is on the other side of the error, telling you they haven't
         gotten to it. */
      heading="We haven’t built this one yet."
      /* The path you actually asked for — enough to spot your own typo, and enough
         to paste into a bug report. Suppressed at "/" only because the root is a
         redirect and can never itself be the miss. */
      detail={pathname && pathname !== '/' ? pathname : null}
      copyLabel="Copy path"
      copiedLabel="Path copied"
      entranceKey={ENTRANCE_KEYS.notFound}
      primaryAction={
        /* /issues is the app's real home. The old page said "Back to tasks", but
           /tasks is only a redirect to /issues — the label was speaking a word the
           product had already retired.

           TOUCH_TARGET on the PRIMARY: BTN_BASE is h-9 (36px), under the 40px
           desktop floor and well under 44px for touch — and without it the page's
           most important control had a smaller hit area than the ghost beside it,
           which already carried the guard. */
        <Link
          to="/issues"
          className={cn(BTN_PRIMARY, LIGHT_FOCUS_RING, TOUCH_TARGET, 'inline-flex items-center')}
        >
          Back to Issues
        </Link>
      }
    />
  );
}
