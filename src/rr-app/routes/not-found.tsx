import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion, useMotionTemplate, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';
import { veilGradientStops } from '@/lib/halftone-field';
import { BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';
import { TOUCH_TARGET } from '@/components/public/PublicLink';
import { PublicTopBar } from '@/components/public/PublicTopBar';
import { HalftoneVeil } from '@/components/auth/HalftoneVeil';

/* ─────────────────────────────────────────────────────────────────────────
 * 404 — the sunset, twice
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
 *   "404" is the horizon; the field below it is the same horizon dithered.
 *
 *   WHY IT REPLACED THE OLD PAGE. The previous 404 was a black canvas with a
 *   magnetic dot-grid: dots on the glyphs sat at alpha 0.32, radius 1.2px, in
 *   #0e7aff on #000. Screenshotted at rest, the numerals were not visible —
 *   they resolved only if the cursor happened to sweep through them, and
 *   nothing on the page invited that. A 404 whose 404 you cannot see is a
 *   structural failure. It was also the product's only pure-black surface, in
 *   an app whose login, legal, docs and dashboard are all Paper light.
 *
 *   ANIMATION STORYBOARD
 *      0ms   canvas + chrome at rest
 *     50ms   numerals fade up (blur 4 → 0)
 *    130ms   headline
 *    210ms   copy + attempted path
 *    290ms   actions
 *    150ms   (in parallel) the veil rises from the bottom edge — its own RISE
 *    hover   the gradient inside the numerals drifts vertically with the
 *            cursor (lazy, overdamped) so the type catches light; the veil's
 *            dots part around the pointer. Two reactions, one gesture.
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

const GHOST_ACTION = cn(
  'text-[13px] font-medium text-ink-body',
  TOUCH_TARGET,
  'transition-[color,opacity] duration-150 ease-out hover:text-ink-title',
  'active:opacity-55 active:duration-[60ms]',
);

export function NotFoundRoute() {
  return <NotFoundContent />;
}

export function NotFoundContent() {
  const reduce = useReducedMotion();
  const { pathname } = useLocation();

  /* The gradient's vertical offset, in percent, as a spring — it rides around
     INK_REST, not zero. useMotionTemplate keeps it on the compositor: no React
     state, no re-render per pointermove. */
  const drift = useSpring(INK_REST, DRIFT_SPRING);
  const inkPosition = useMotionTemplate`50% ${drift}%`;

  /* Mouse-only, and only when motion is welcome. A touch device has no hover to
     trail, and there is nothing here worth spending a listener on without one. */
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    setFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

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
     button. Read once, after mount, so SSR/tests don't fork on it. */
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
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
    <div className="overview-light relative flex min-h-dvh flex-col bg-white px-6 antialiased [color-scheme:light] dark:bg-[#171717] dark:[color-scheme:dark]">
      <PublicTopBar />

      {/* The login gradient, verbatim: the same halftone bloom, pinned to the
          bottom edge, with the same cursor lens. Fixed, so it holds the floor of
          the viewport; it paints above static siblings, hence the z-[1] on main. */}
      <HalftoneVeil />

      <motion.main
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-[1] mx-auto my-auto flex w-full max-w-[440px] flex-col items-center py-24 text-center"
      >
        {/* role="img" rather than bare text: the glyphs are a mark, not prose,
            and AT should say "404" once — not spell it into the headline that
            follows. leading-[0.85] pulls the type's own optical box tight so the
            gradient spans the numerals, not the empty air above them. */}
        <motion.div
          variants={item}
          role="img"
          aria-label="404"
          style={{
            backgroundImage: SUNSET_INK,
            backgroundSize: `100% ${INK_HEIGHT}`,
            backgroundPosition: reduce || !finePointer ? `50% ${INK_REST}%` : inkPosition,
          }}
          className={cn(
            'bg-clip-text text-[clamp(104px,17vw,196px)] font-medium leading-[0.85] tracking-[-0.04em] tabular-nums',
            '[-webkit-text-fill-color:transparent]',
            NUMERAL_FALLBACK,
          )}
        >
          404
        </motion.div>

        <motion.h1
          variants={item}
          className="mt-9 text-balance text-[22px] font-medium leading-tight text-ink-title"
        >
          This page doesn’t exist
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-3 max-w-[340px] text-pretty text-sm leading-normal text-ink-muted-strong dark:text-ink-muted"
        >
          The link may be broken, or the page may have moved.
        </motion.p>

        {/* The path you actually asked for. The error boundary already prints its
            failure detail in mono; this is the same courtesy for a wrong URL —
            enough to spot your own typo, and enough to paste into a bug report.
            ink-muted-strong (4.9:1), not the faint tier the error card uses: a
            path is information, not decoration. */}
        {pathname && pathname !== '/' ? (
          <motion.p
            variants={item}
            className="mt-5 max-w-full truncate rounded-full bg-wash-4 px-3 py-1 font-mono text-[12px] text-ink-muted-strong"
          >
            {pathname}
          </motion.p>
        ) : null}

        {/* ONE primary. The old page offered "Back to tasks" and "Open docs" as
            near-equal pills — but "docs" is a guess at what a lost user wants,
            not a recovery path, and /tasks is only a redirect to /issues, so the
            label was speaking a word the product retired. */}
        <motion.div variants={item} className="mt-8 flex items-center gap-5">
          <Link to="/issues" className={cn(BTN_PRIMARY, LIGHT_FOCUS_RING, 'inline-flex items-center')}>
            Back to Issues
          </Link>
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
