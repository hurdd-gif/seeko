import { cn } from '@/lib/utils';
import { ENTRANCE_KEYS } from '@/lib/entrance-once';
import { BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { TOUCH_TARGET } from '@/components/public/PublicLink';
import { SunsetErrorPage } from '@/components/public/SunsetErrorPage';

/* ─────────────────────────────────────────────────────────────────────────
 * 500 — the 404's sibling, and deliberately not its twin.
 *
 *   Same body (<SunsetErrorPage>), same canvas, same mark, same veil. The two
 *   pages differ in exactly the two places where a failure is not a wrong
 *   address:
 *
 *     • the line     — a 404 says we never built it; a 500 says we broke it.
 *     • the primary  — a 404 offers somewhere to GO (/issues, the app's home);
 *                      a 500 offers something to RETRY, because the page you
 *                      wanted may well be one reload away and sending you home
 *                      would be sending you away from what you came for.
 *
 *   WHERE THIS ACTUALLY RENDERS. Almost never at /500. A 500 in this app is not
 *   a redirect, it is a React Router error boundary: <StandaloneErrorBoundary>
 *   in routes.tsx catches a thrown loader on every chrome-less route (issues,
 *   task detail, contractor, the investor cluster, onboarding, agreement,
 *   invoice, sign, shared) and renders this. The /500 path exists so the page
 *   can be seen, linked, and QA'd without breaking something first — the same
 *   reason /toast-qa and /payments-chart-qa exist.
 *
 *   WHAT STAYED QUIET. <RootErrorBoundary> — the in-shell one — does NOT render
 *   this page. It keeps its bare centered text inside the studio chrome, and
 *   that is a decision, not an oversight: there, the nav is intact, the user is
 *   mid-session, and ONE region failed. A six-inch gradient 500 dropped into a
 *   working shell would make the failure the loudest object in an app that is
 *   otherwise fine — precisely the thing the previous error card got wrong. On
 *   the standalone routes there is no shell and no surrounding content: the
 *   boundary owns the whole viewport, so it is not competing with anything, and
 *   a full page is simply what it is.
 * ───────────────────────────────────────────────────────────────────────── */

export function ServerErrorRoute() {
  /* No detail on a direct visit, and no pill either.
   *
   *   The mono line exists to hand you the one thing you cannot retype: the
   *   failure's own message, quotable into a bug report. A direct visit to /500
   *   has no thrown error to quote. An earlier draft filled the gap with the
   *   literal string "500 Internal Server Error" — which put a COPY BUTTON on a
   *   sentence that only restates the mark six inches above it. That is the same
   *   mistake as the 404's old "This page doesn't exist" headline, wearing a
   *   different element: prose that spells out the numeral you are looking at.
   *   When there is nothing worth handing over, hand over nothing. */
  return <ServerErrorContent detail={null} />;
}

export function ServerErrorContent({ detail }: { detail?: string | null }) {
  return (
    <SunsetErrorPage
      mark="500"
      /* The grammatical sibling of the 404's "We haven't built this one yet." —
         same voice, same plainness, same first person. It owns the fault, which
         is the whole job of a 500: the user did nothing wrong and should not be
         left wondering whether they did.

         "Something went wrong" was never in the running. It is this page's
         version of the 404's stock line — Threads, PayPal, Midday, VEED, Retool
         and Typeform all ship it near word for word (Mobbin, 2026-07-13) — and it
         is written in the passive voice precisely so that nobody has to say who
         broke it. We know who broke it. */
      heading="We broke something."
      /* The failure's own message or status, quotable into a bug report. The old
         error card printed this too, but `truncate`d it — which on a stack-ish
         message means it ellipsizes before it says anything. Here it wraps, and
         it has a copy button. */
      detail={detail ?? null}
      copyLabel="Copy error detail"
      copiedLabel="Error detail copied"
      entranceKey={ENTRANCE_KEYS.serverError}
      primaryAction={
        /* A hard reload, not a router navigation. The boundary is standing on a
           tree whose loader already threw; re-running it in the same document
           can just as easily re-throw against the same poisoned client state.
           The user's mental model of "try again" is the refresh button, and the
           honest implementation of that is the refresh button. */
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(BTN_PRIMARY, LIGHT_FOCUS_RING, TOUCH_TARGET, 'inline-flex items-center')}
        >
          Try again
        </button>
      }
    />
  );
}
