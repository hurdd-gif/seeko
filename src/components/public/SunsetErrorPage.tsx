import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import { cn } from '@/lib/utils';
import { ENTRANCE_KEYS, useEntranceOnce } from '@/lib/entrance-once';
import { veilGradientStops } from '@/lib/halftone-field';
import { LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { TOUCH_TARGET } from '@/components/public/PublicLink';
import { PublicTopBar } from '@/components/public/PublicTopBar';
import { HalftoneVeil } from '@/components/auth/HalftoneVeil';

/* ─────────────────────────────────────────────────────────────────────────
 * The sunset error page — the shared body of /404 and /500.
 *
 *   The page is built from ONE palette in TWO materials, and the pairing is
 *   the whole idea:
 *
 *     • the numerals  → the sunset as continuous ink (a gradient clipped to
 *                       the type, interpolated in OKLab)
 *     • the veil      → the sunset as halftone dots (login's HalftoneVeil,
 *                       imported verbatim — same component, same bloom, same
 *                       cursor lens)
 *
 *   Both read their colors from VEIL_STOPS, so they cannot drift apart. The
 *   mark is the horizon; the field below it is the same horizon dithered.
 *
 *   WHY IT IS ONE COMPONENT. The 404 shipped first and the 500 is its sibling:
 *   same canvas, same mark, same stagger, same mono pill, same actions. The
 *   only real differences are three strings and one button. Copied, the two
 *   pages would drift the first time anyone touched INK_REST — and every
 *   constant in this file is a tuned value with a reason attached, which is
 *   exactly the kind of thing that survives in one place and rots in two.
 *
 *   WHAT DIFFERS, AND WHY IT IS ONLY COPY. A 404 is not a failure — nothing is
 *   broken, you are simply at an address we never built. A 500 IS a failure:
 *   something that should have worked did not. That distinction is carried by
 *   the WORDS and the actions ("Back to Issues" vs "Try again"), not by the
 *   material. Making the failure page grey while the 404 gets the sunset would
 *   say the failure is a lesser citizen of the product — and the whole point of
 *   the error work in routes.tsx was that every route should degrade INTO the
 *   light design rather than out of it.
 *
 *   ANIMATION STORYBOARD
 *      0ms   canvas + chrome at rest
 *     50ms   numerals fade up (blur 4 → 0)
 *    130ms   headline
 *    210ms   the mono detail (path, or the failure's own message)
 *    290ms   actions
 *    150ms   (in parallel) the veil rises from the bottom edge — its own RISE
 *    hover   the gradient inside the numerals drifts vertically with the
 *            cursor (lazy, overdamped) so the type catches light; the veil's
 *            dots part around the pointer. Two reactions, one gesture.
 *
 *   The storyboard runs ONCE PER TAB (see lib/entrance-once). These are pages
 *   you often hit twice — fix the URL, get it wrong, land again; refresh a
 *   failure hoping it clears — and an entrance that replays on every arrival
 *   stops reading as an arrival and starts reading as a load.
 *
 *   Reduced motion / coarse pointer: everything renders at rest, no drift.
 *   forced-colors + prefers-contrast: more: the gradient is dropped and the
 *   numerals fall back to solid ink (see NUMERAL_FALLBACK).
 * ───────────────────────────────────────────────────────────────────────── */

/** The login gradient, as ink. Bottom-anchored like the veil's bloom (deep
 *  orange at the baseline, ultramarine at the cap), so the numerals and the
 *  field below them agree about which way the sky goes. `in oklab` is not
 *  optional: sRGB blending between these saturated bands detours through
 *  desaturated middles that read as grey seams in continuous ink. */
const SUNSET_INK = `linear-gradient(to top in oklab, ${veilGradientStops()})`;

/** The gradient is painted slightly taller than the type so there is headroom to
 *  slide it, and the cursor moves it ±DRIFT% around center. The margin is TIGHT
 *  (130%, ±8) for a reason. At 150%/±16 the visible window was the palette's
 *  middle — amber → cream → sky → cerulean — which put the CREAM stop (#f2e3c2,
 *  1.2:1 on white) on the glyph baselines: the numerals faded out at the bottom
 *  and read as a rendering fault, and the palette's most distinctive color, the
 *  deep orange, never appeared in the mark at all. 130%/±8 keeps the window at
 *  roughly 4–96% of the palette in every drift position, so the baselines stay
 *  anchored in orange (3.9:1) and cream retreats to a thin highlight band across
 *  the lower third — a glare on the horizon, which is what it is. */
const INK_HEIGHT = '130%';
const DRIFT = 8;
/** Rest position of that window, biased DOWN the palette rather than centered.
 *  `to top` puts orange at the image's bottom, so a larger background-position-y
 *  shows more of the warm end. Centered (50%) the glyph terminals sampled amber
 *  (#ee8a2f, 2.4:1) — the numerals still trailed off pale at the baseline, just
 *  less than before. The type's box is taller than the glyphs sitting in it (the
 *  descender space below the baseline is empty), so the palette's warmest inches
 *  were being spent on air. 62% spends them on the glyphs instead. */
const INK_REST = 62;
/** Overdamped and lazy, well past critical damping — the same instinct as the
 *  veil's own drift. This is light moving across a surface, not a control
 *  answering a command; it should trail the cursor, never chase it. */
const DRIFT_SPRING = { stiffness: 42, damping: 20, mass: 1 } as const;

/** Where the gradient can't survive. `background-clip: text` + a transparent
 *  fill is invisible in forced-colors mode (the UA repaints backgrounds and the
 *  glyphs go with them), and under prefers-contrast: more a six-band gradient is
 *  the opposite of what was asked for. Both fall back to solid ink. */
const NUMERAL_FALLBACK = cn(
  'contrast-more:![background:none] contrast-more:[-webkit-text-fill-color:var(--ink-title)]',
  'forced-colors:![background:none] forced-colors:[-webkit-text-fill-color:currentColor]',
);

export const GHOST_ACTION = cn(
  'text-[13px] font-medium text-ink-body',
  TOUCH_TARGET,
  // transform is IN the transition list on purpose: `active:scale-[0.96]` with a
  // transition that only names color and opacity snaps to the pressed size and
  // snaps back, which reads as a glitch rather than as a press.
  'transition-[color,opacity,transform] duration-150 ease-out hover:text-ink-title',
  'active:scale-[0.96] active:opacity-55 active:duration-[60ms]',
);

/** The 24px copy button's own hit area, grown to 44px in BOTH axes. TOUCH_TARGET
 *  only stretches vertically (inset-x-0), which is right for a full-width row and
 *  useless for a small square. Nothing else in the pill is interactive, so there
 *  is nothing for the grown box to collide with. */
const ICON_HIT_AREA = "after:absolute after:-inset-[10px] after:content-['']";

export type SunsetErrorPageProps = {
  /** The numerals. A mark, not prose — announced once to AT, never spelled into
   *  the headline that follows it. */
  mark: string;
  /** The one line of copy. Plain and first-person on both pages; see the notes
   *  at each call site for the drafts that died getting there. */
  heading: string;
  /** The mono line: the path you asked for, or the failure's own message.
   *  Omitted (with its pill) when there is nothing worth handing over. */
  detail?: string | null;
  /** aria-label for the copy button, resting and copied. The two pages are
   *  copying different things and a screen reader should say which. */
  copyLabel: string;
  copiedLabel: string;
  /** sessionStorage key for the once-per-tab entrance (ENTRANCE_KEYS.*). */
  entranceKey: string;
  /** The single primary action. A <Link> on the 404 (somewhere to go), a
   *  <button> on the 500 (something to retry) — the pages disagree about what
   *  recovery means, and that is the only structural difference between them. */
  primaryAction: ReactNode;
};

export function SunsetErrorPage({
  mark,
  heading,
  detail,
  copyLabel,
  copiedLabel,
  entranceKey,
  primaryAction,
}: SunsetErrorPageProps) {
  const reduce = useReducedMotion();
  const playEntrance = useEntranceOnce(entranceKey);

  /* The gradient's vertical offset, in percent, as a spring — it rides around
     INK_REST, not zero. useMotionTemplate keeps it on the compositor: no React
     state, no re-render per pointermove. */
  const drift = useSpring(INK_REST, DRIFT_SPRING);
  const inkPosition = useMotionTemplate`50% ${drift}%`;

  /* Mouse-only, and only when motion is welcome. A touch device has no hover to
     trail, and there is nothing here worth spending a listener on without one.
     Read during render, like canGoBack below and for the same reason. */
  const [finePointer] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  useEffect(() => {
    if (reduce || !finePointer) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // Cursor height, normalized to −0.5…0.5 from center, mapped to ±DRIFT
      // around the resting window.
      drift.set(INK_REST + (e.clientY / window.innerHeight - 0.5) * 2 * DRIFT);
    };
    // Alt-tab parks the cursor wherever it was — settle back rather than leave
    // the sky frozen mid-tilt around a ghost pointer.
    const onLeave = () => drift.set(INK_REST);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [drift, reduce, finePointer]);

  /* "Go back" is only offered when there IS a back — a pasted URL or a fresh tab
     lands here with no history, and a button that does nothing is worse than no
     button.

     Read in a useState INITIALIZER, not an effect. This used to be an effect, and
     it made the actions row JUMP on every load: the first paint had one button,
     centered; a frame later the effect appended "Go back", the flex row
     re-centered, and the primary visibly slid left. An effect answers a question
     one frame after the frame that needed the answer. There is no SSR here to
     fork on — this is a client-only SPA — so the honest place to read the
     history length is during the render that depends on it. */
  const [canGoBack] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.history.length > 1;
  });

  /* Copying the detail. The clipboard write can genuinely fail — a non-secure
     origin, a denied permission — and the honest answer to that is not a
     "Failed" label with nowhere to go: it's that the detail itself stays
     SELECTABLE (see select-text below), so the keyboard route always works. The
     button is the affordance; selection is the floor under it. */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyDetail = useCallback(() => {
    if (!detail) return;
    navigator.clipboard?.writeText(detail).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [detail]);

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };

  /* Icon swap, per the house rule: scale 0.25 → 1, opacity 0 → 1, blur 4px → 0,
     on a spring with bounce 0 — never a visibility toggle. Under reduced motion
     the geometry is dropped and only the crossfade survives. */
  const iconSwap = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
        transition: { type: 'spring' as const, duration: 0.3, bounce: 0 },
      };
  const item = reduce
    ? { hidden: {}, show: {} }
    : {
        hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
        show: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { type: 'spring' as const, stiffness: 220, damping: 28 },
        },
      };

  return (
    // The Paper canvas, identical to /login's — including the color-scheme
    // override, without which the scrollbar renders as a dark track on the
    // white page (the app body declares dark).
    //
    // select-none is NOT cosmetic here. The numerals are a gradient clipped to
    // the type with a TRANSPARENT fill, so a drag-select paints the selection
    // rectangle behind glyphs that have no ink of their own: the mark collapses
    // into a solid blue slab and stops being readable at all.
    //
    // The guard is on the whole canvas, with exactly ONE hole: the detail keeps
    // `select-text`. That is not an inconsistency, it is the rule — the chrome is
    // interface and the detail is content, and the only text on this page anyone
    // has a reason to copy is the path they mistyped or the error they hit. Cmd+A
    // now grabs that and nothing else, which is precisely what a select-all
    // should hand you.
    <div className="overview-light relative flex min-h-dvh select-none flex-col bg-white px-6 antialiased [color-scheme:light] dark:bg-[#171717] dark:[color-scheme:dark]">
      <PublicTopBar />

      {/* The login gradient, verbatim: the same halftone bloom, pinned to the
          bottom edge, with the same cursor lens. Fixed, so it holds the floor of
          the viewport; it paints above static siblings, hence the z-[1] on main. */}
      <HalftoneVeil />

      {/* Mount at "show", not initial={false}, when the entrance is spent. Both
          suppress the animation, but `initial={false}` leaves the children's
          hidden variant as their notional start state, and any later re-render
          that re-runs the parent's variant propagation can flash them. Naming the
          SAME variant on both sides is unambiguous: there is no delta, so there
          is nothing to animate, and the children have no hidden state to fall
          back into. */}
      <motion.main
        variants={stagger}
        initial={playEntrance ? 'hidden' : 'show'}
        animate="show"
        className="relative z-[1] mx-auto my-auto flex w-full max-w-[440px] flex-col items-center py-24 text-center"
      >
        {/* role="img" rather than bare text: the glyphs are a mark, not prose,
            and AT should say it once — not spell it into the headline that
            follows. leading-[0.85] pulls the type's own optical box tight so the
            gradient spans the numerals, not the empty air above them. */}
        <motion.div
          variants={item}
          role="img"
          aria-label={mark}
          style={{
            backgroundImage: SUNSET_INK,
            backgroundSize: `100% ${INK_HEIGHT}`,
            backgroundPosition: reduce || !finePointer ? `50% ${INK_REST}%` : inkPosition,
          }}
          className={cn(
            // No tabular-nums. The mark never changes, so there is no layout shift
            // to prevent — and tabular figures force every digit into one width,
            // which at 196px hands the 0 more sidebearing than Inter's proportional
            // cut is drawn for. This is type, not a readout; it gets the designed fit.
            'bg-clip-text text-[clamp(104px,17vw,196px)] font-medium leading-[0.85] tracking-[-0.04em]',
            '[-webkit-text-fill-color:transparent]',
            NUMERAL_FALLBACK,
          )}
        >
          {mark}
        </motion.div>

        {/* One line, not two. The 404 used to carry a headline ("This page
            doesn't exist") over a subhead, and the subhead was the only one of
            them with a voice — the headline was just the mark spelled out in
            words, and the mark is already six inches tall directly above it.
            text-balance keeps the rag even if it ever wraps. */}
        <motion.h1
          variants={item}
          className="mt-9 text-balance text-2xl font-medium leading-[1.15] text-ink-title"
        >
          {heading}
        </motion.h1>

        {/* The one thing worth taking with you: the path you actually asked for,
            or the failure's own message. PayPal's debug-ID pattern — plain mono
            text you can quote into a bug report — done properly, which means it
            is both COPYABLE and READABLE.

            It WRAPS (break-all), it does not truncate. Truncation on the single
            piece of content the page exists to hand you is self-defeating: a long
            path ellipsizes exactly where the typo usually is, and a stack-ish error
            message ellipsizes before it says anything. Two lines of mono cost
            nothing on a page that is otherwise air.

            ink-muted-strong (4.9:1), not the faint tier: this is information, not
            decoration. */}
        {detail ? (
          <motion.div
            variants={item}
            className="mt-5 flex max-w-full items-center gap-1 rounded-full bg-wash-4 py-1 pl-3 pr-1"
          >
            <span className="select-text break-all text-left font-mono text-xs leading-normal text-ink-muted-strong">
              {detail}
            </span>
            <button
              type="button"
              onClick={copyDetail}
              aria-label={copied ? copiedLabel : copyLabel}
              className={cn(
                'relative grid size-6 shrink-0 place-items-center rounded-full text-ink-muted',
                ICON_HIT_AREA,
                'transition-[color,background-color,transform] duration-150 ease-out',
                'hover:bg-wash-6 hover:text-ink-title active:scale-[0.96]',
                LIGHT_FOCUS_RING,
              )}
            >
              {/* Both icons live in the same grid cell so the swap is a crossfade in
                  place — the button never reflows and never resizes under the cursor. */}
              <AnimatePresence initial={false}>
                {copied ? (
                  <motion.span key="check" {...iconSwap} className="col-start-1 row-start-1">
                    <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
                  </motion.span>
                ) : (
                  <motion.span key="copy" {...iconSwap} className="col-start-1 row-start-1">
                    <Copy className="size-3.5" strokeWidth={2} aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        ) : null}

        {/* ONE primary. The 404 used to offer "Back to tasks" and "Open docs" as
            near-equal pills — but "docs" is a guess at what a lost user wants, not
            a recovery path. A page in trouble gets exactly one way forward and one
            way back. */}
        <motion.div variants={item} className="mt-8 flex items-center gap-5">
          {primaryAction}
          {canGoBack ? (
            <button
              type="button"
              onClick={() => window.history.back()}
              className={cn(GHOST_ACTION, LIGHT_FOCUS_RING, 'rounded-full')}
            >
              Go back
            </button>
          ) : null}
        </motion.div>
      </motion.main>
    </div>
  );
}
