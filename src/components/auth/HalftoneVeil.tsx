'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Halftone Veil (login bottom)
 *
 *    0ms   page renders, veil absent (scaleY 0, origin bottom)
 *  150ms   veil rises from the bottom edge — slides up from below
 *          the viewport (translateY 100% → 0) with a fade, smooth
 *          settle, no bounce — after the card's own entrance beats
 *          (0–170ms) so it never competes with the content
 *  hover   dots within ~140px part away from the cursor — each
 *          dot chases its own displaced target (per-dot lerp),
 *          so a moving cursor leaves an organic wake through the
 *          field; dots relax back individually when it leaves
 *  idle    static — the rAF loop stops once every dot settles,
 *          so at rest nothing runs
 *
 *  Repeat visits (same sessionStorage key as the card entrance)
 *  and prefers-reduced-motion render it already-settled; reduced
 *  motion also disables the lens entirely.
 * ───────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useSpring } from 'motion/react';
import {
  bloomAlpha,
  bloomIntensity,
  lensDisplacement,
  sampleVeilGradient,
} from '@/lib/halftone-field';

/** Same key LoginForm uses — one "has seen the entrance" signal per tab. */
const ENTRANCE_PLAYED_KEY = 'seeko-login-entrance-played';

/** Dot-grid pitch in CSS px (Delphi ships 10). */
const PITCH = 10;
/** Max dot radius at the bloom center (Delphi ships 5.2 on the same grid —
 *  diameter 10.4 on a 10px pitch, so the core dots just merge). No radius
 *  jitter: Delphi's grid is perfectly mechanical, and that clean ramp is
 *  what reads as a confident print halftone instead of noise. */
const MAX_RADIUS = 5.2;
/** Bloom ellipse. Vertical reach lowered by user order (2026-07-11): the
 *  ink now tops out just under the legal footnote (~80% down the viewport)
 *  instead of Delphi's mid-page reach — the canvas is 24vh, ry = 0.833 ×
 *  24vh = 20vh. The horizontal radius keeps its original Delphi-measured
 *  absolute size (1.33 × the old 50vh reach = 66.5vh) so the field still
 *  spans ~75% of the viewport — only the height compressed, hence the
 *  aspect is now 66.5 / 20 = 3.325 rather than Delphi's 1.33. */
const BLOOM_RY_FRAC = 0.833;
const BLOOM_ASPECT = 3.325;

/** Lens reach in px — dots inside this distance part around the cursor.
 *  Radius/strength/ease are Delphi's shipped values (build.delphi.ai). */
const LENS_RADIUS = 140;
/** Peak push in px directly under the cursor. */
const LENS_STRENGTH = 30;
/** Per-frame lerp toward each dot's own displaced target. The wake effect
 *  lives here: every dot is at a different phase of its own chase, so a
 *  moving cursor churns the field instead of dragging a rigid lens. */
const DOT_EASE = 0.18;

const RISE = { delay: 0.15, type: 'spring', duration: 1.1, bounce: 0 } as const;

/** Soft sunset wash under the dot field's dense core: the same palette and
 *  bottom-center ellipse as the bloom (echoing its 1.33 aspect) so glow and
 *  ink read as one object, at low alpha so the dots stay the subject and the
 *  page stays airy. Sized to the core only — it dies out well below the
 *  card, never competing with the frost halo above. */
const CORE_GLOW =
  'radial-gradient(ellipse 62% 46% at 50% 100%, rgba(228,88,29,0.20), rgba(238,138,47,0.13) 38%, rgba(242,227,194,0.07) 68%, rgba(242,227,194,0) 88%)';

/** Dark's glow — same ellipse and warm core, different tail. Two things break
 *  CORE_GLOW on a near-black ground:
 *
 *  1. Its outer stops are CREAM (242,227,194). Against white that reads as
 *     nothing, which is exactly why it works in light; against near-black it is
 *     a pale grey fog, so the glow ends in a visible haze ring instead of
 *     dissolving. Dark holds the warm hue all the way out — the wash fades to
 *     transparent orange, never to grey.
 *  2. Its four stops fall off linearly, which Mach-bands into a soft edge you
 *     can see. Dark eases instead: a fast drop out of the core, then a long low
 *     tail that reaches zero well inside the container, so there is no boundary
 *     to catch.
 *
 *  Peak alpha is half of light's (0.10 vs 0.20) — the same wash reads far
 *  hotter on black than on white — and the mid/outer stops are cut harder still
 *  so the edges go dark first and the core keeps its heat. */
const CORE_GLOW_DARK =
  'radial-gradient(ellipse 62% 46% at 50% 100%, rgba(228,88,29,0.10), rgba(231,101,34,0.072) 22%, rgba(233,113,40,0.042) 42%, rgba(235,124,45,0.020) 60%, rgba(237,132,49,0.007) 76%, rgba(238,138,47,0) 90%)';

/** GradientVeil: the same field as continuous ink instead of halftone dots.
 *  Color = the sunset bands (VEIL_STOPS offsets × BLOOM_RY_FRAC of the 60vh
 *  container, so each hue lands at the exact height its dot rows did; the
 *  last stop holds ultramarine upward). Interpolated in OKLab: sRGB blending
 *  detours through muddy desaturated middles between the saturated bands
 *  (orange↔cream↔sky), which read as gray seams in continuous ink.
 *  Shape = the same bloom ellipse as a mask, in vh so it stays true:
 *  ry = 0.833 × 60vh = 50vh, rx = 1.33 × ry. */
const SUNSET_STOPS = `#e4581d 0%,
  #ee8a2f 13.3%,
  #f2e3c2 28.3%,
  #82c0dc 43.3%,
  #1573c6 60%,
  #1d33b4 76.6%`;
const SUNSET_LINEAR = `linear-gradient(to top in oklab, ${SUNSET_STOPS})`;
/** Mask alpha follows a cosine falloff, 0.95·(1+cos(πd))/2, sampled every
 *  10%. A sparse piecewise-linear ramp puts a slope break at every stop and
 *  the eye reads each break as a ring (mach bands) — the cosine is smooth
 *  everywhere and flat at both ends, so the core has no oval edge and the
 *  rim dissolves instead of stopping. It also carries more ink through the
 *  midfield than the dots' coverage curve did, which is what lets the sky
 *  and cerulean bands read at all (a faithful cubic falloff buried them). */
const BLOOM_FALLOFF = [
  0.95, 0.927, 0.86, 0.754, 0.62, 0.475, 0.33, 0.196, 0.091, 0.023, 0,
]
  .map((a, i) => `rgba(0,0,0,${a}) ${i * 10}%`)
  .join(', ');
const BLOOM_MASK = `radial-gradient(ellipse 66.5vh 50vh at 50% 100%, ${BLOOM_FALLOFF})`;

/** Cursor drift for the gradient form: the whole bloom leans toward the
 *  pointer — the continuous-ink answer to the dot lens (no dots to part, so
 *  the field moves as one mass, like a glow drawn to you). Transform-only:
 *  translating the layer costs nothing per frame, where re-painting the
 *  mask would rasterize the full-width layer on every move. */
const DRIFT_X = 72;
/** Vertical reach is a third of horizontal — the bloom hugs the bottom
 *  edge, so big vertical travel reads as the page floor detaching. */
const DRIFT_Y = 14;
/** Overdamped and lazy (well past critical damping): the bloom is ambience,
 *  not a control — it should trail the cursor like light, never chase it. */
const DRIFT_SPRING = { stiffness: 42, damping: 20, mass: 1 } as const;
/** Bleed beyond the viewport on the sides and bottom so the drift never
 *  drags a white edge into view (bleed > max drift on each axis). */
const DRIFT_BLEED_X = 88;
const DRIFT_BLEED_Y = 20;

type Dot = { x: number; y: number; r: number; fill: string; ox: number; oy: number };

/** Precompute the resting field once per size — the rAF loop only repaints.
 *  Geometry is Delphi's elliptical bloom (intensity drives radius + alpha);
 *  color is a pure function of height (flat vertical sunset bands).
 *
 *  The palette is scheme-INDEPENDENT. Dark used to flatten every dot to one
 *  grey on the theory that the sunset bands would read as glare on a near-black
 *  canvas. The Figma dark reference (LOGIN/DARK node 1:2) says otherwise, and
 *  it was measured, not eyeballed: the brightest dot at the bottom edge samples
 *  to #e4581d — VEIL_STOPS[0] exactly, unattenuated — and the field climbs
 *  through amber → cream → steel blue just as it does in light. The bloom's own
 *  alpha ramp is what keeps the pale cream band from glaring; no re-tint needed.
 *  Grey dots were the bug this function used to encode. */
function buildDots(w: number, h: number): Dot[] {
  const dots: Dot[] = [];
  const cx = w / 2;
  const ry = h * BLOOM_RY_FRAC;
  const rx = ry * BLOOM_ASPECT;
  const rows = Math.ceil(h / PITCH);
  const cols = Math.ceil(w / PITCH);
  for (let j = 0; j < rows; j++) {
    const y = j * PITCH + PITCH / 2;
    // One color per row — bands stay perfectly horizontal like the mark.
    // Normalized to the bloom's vertical reach (not the canvas) so the full
    // palette lands on rows that actually have ink; above ry nothing draws.
    const [red, green, blue] = sampleVeilGradient((1 - y / h) / BLOOM_RY_FRAC);
    const rowFill = `${Math.round(red)},${Math.round(green)},${Math.round(blue)}`;
    for (let i = 0; i < cols; i++) {
      const x = i * PITCH + PITCH / 2;
      const n = bloomIntensity(x - cx, y - h, rx, ry);
      if (n <= 0) continue;
      const r = MAX_RADIUS * n;
      if (r < 0.3) continue;
      dots.push({
        x,
        y,
        r,
        fill: `rgba(${rowFill},${bloomAlpha(n).toFixed(3)})`,
        ox: 0,
        oy: 0,
      });
    }
  }
  return dots;
}

/**
 * Continuous-gradient variant of the veil — same geometry, palette, and
 * entrance as HalftoneVeil, rendered as one smooth CSS bloom instead of a
 * dot field. The cursor still moves it: with no discrete dots to part, the
 * whole bloom leans toward the pointer on a lazy spring (see DRIFT_*).
 * Mouse-only and dropped under prefers-reduced-motion, like the dot lens.
 * Swap freely with HalftoneVeil in the login route to compare treatments.
 * NOTE: still the original 60vh/mid-page geometry — predates the 2026-07-11
 * lowering of the dot field; re-measure before reactivating.
 */
export function GradientVeil() {
  const reduceMotion = useReducedMotion();
  const driftX = useSpring(0, DRIFT_SPRING);
  const driftY = useSpring(0, DRIFT_SPRING);
  const [skipEntrance] = useState(() => {
    try {
      return sessionStorage.getItem(ENTRANCE_PLAYED_KEY) !== null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (reduceMotion || !finePointer) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // Normalized cursor position (−0.5 … 0.5 from screen center) → lean.
      driftX.set((e.clientX / window.innerWidth - 0.5) * 2 * DRIFT_X);
      driftY.set((e.clientY / window.innerHeight - 0.5) * 2 * DRIFT_Y);
    };
    const onLeave = () => {
      driftX.set(0);
      driftY.set(0);
    };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    // Alt-tab parks the cursor wherever it was — recenter the bloom.
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [reduceMotion, driftX, driftY]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed origin-bottom print:hidden contrast-more:hidden"
      style={{
        // Bled past the viewport so the drift never exposes a white edge;
        // height compensates so the ink still tops out at the same line.
        insetInline: -DRIFT_BLEED_X,
        bottom: -DRIFT_BLEED_Y,
        height: `calc(60vh + ${DRIFT_BLEED_Y}px)`,
        background: SUNSET_LINEAR,
        maskImage: BLOOM_MASK,
        WebkitMaskImage: BLOOM_MASK,
        x: driftX,
        y: driftY,
      }}
      initial={reduceMotion || skipEntrance ? false : { opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={RISE}
    />
  );
}

/**
 * Decorative halftone dot field pinned to the bottom of the login viewport:
 * Delphi's centered elliptical bloom colored with the sunset-mark palette as
 * flat horizontal bands (see lib/halftone-field.ts for the recipe and
 * sources), with a cursor lens that parts the dots around the pointer. Purely ambient — pointer-transparent,
 * hidden from AT, and removed entirely under prefers-contrast: more since it
 * only ever sits behind text.
 */
export function HalftoneVeil() {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read during render (before any effect can write the key) so the veil and
  // the card agree on whether this is a first visit.
  const [skipEntrance] = useState(() => {
    try {
      return sessionStorage.getItem(ENTRANCE_PLAYED_KEY) !== null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const context = el.getContext('2d');
    if (!context) return;
    // Non-null aliases the closures below can capture (the repo's TS version
    // doesn't carry the guard narrowing into nested functions).
    const canvas: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    let dots: Dot[] = [];
    let w = 0;
    let h = 0;
    // Pointer state lives outside React — pure presentation, 60fps territory.
    const pointer = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let running = false;

    /** Repaint the field, advancing every dot toward its own displaced
     *  target. Returns true while any dot is still in flight. */
    function paint(): boolean {
      ctx.clearRect(0, 0, w, h);
      let moving = false;
      for (const dot of dots) {
        let tx = 0;
        let ty = 0;
        if (pointer.active) {
          [tx, ty] = lensDisplacement(
            dot.x - pointer.x,
            dot.y - pointer.y,
            LENS_RADIUS,
            LENS_STRENGTH,
          );
        }
        dot.ox += (tx - dot.ox) * DOT_EASE;
        dot.oy += (ty - dot.oy) * DOT_EASE;
        if (Math.abs(tx - dot.ox) > 0.05 || Math.abs(ty - dot.oy) > 0.05) {
          moving = true;
        }
        ctx.fillStyle = dot.fill;
        ctx.beginPath();
        ctx.arc(dot.x + dot.ox, dot.y + dot.oy, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
      return moving;
    }

    function tick() {
      if (paint()) {
        raf = requestAnimationFrame(tick);
      } else {
        // Every dot reached its target (parted around a resting cursor, or
        // fully relaxed) — stop; the next pointermove wakes the loop.
        running = false;
      }
    }

    function wake() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }

    function resize() {
      // Layout size, not getBoundingClientRect — the bounding rect is offset
      // by the entrance transform while it's mid-flight, and this can run then.
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      // Cap at 2 — 3x panels triple the per-frame fill cost for no visible
      // gain on a soft dot field (Delphi ships the same cap).
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = buildDots(w, h);
      paint();
    }

    resize();

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    };
    window.addEventListener('resize', onResize);

    // The canvas is pointer-transparent, so the lens listens on the window.
    // Mouse-driven only: on touch there is no hover to trail, and reduced
    // motion opts out of the warp entirely.
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const wasActive = pointer.active;
      // The canvas is fixed, full-bleed, and bottom-anchored, so its settled
      // position is derivable — no per-mousemove layout read, and the lens
      // addresses the resting field even while the entrance is mid-flight.
      pointer.x = e.clientX;
      pointer.y = e.clientY - (window.innerHeight - h);
      // Engage within a LENS_RADIUS margin around the field so dots start
      // parting as the cursor approaches, instead of popping at the edge.
      pointer.active =
        pointer.x >= -LENS_RADIUS &&
        pointer.x <= w + LENS_RADIUS &&
        pointer.y >= -LENS_RADIUS &&
        pointer.y <= h + LENS_RADIUS;
      // Far outside with nothing displaced: don't wake the loop for a no-op
      // frame on every mousemove elsewhere on the page.
      if (!pointer.active && !wasActive && !running) return;
      wake();
    };
    const onLeave = () => {
      pointer.active = false;
      wake();
    };
    if (!reduceMotion && finePointer) {
      window.addEventListener('pointermove', onMove);
      document.documentElement.addEventListener('pointerleave', onLeave);
      // Alt-tab parks the cursor wherever it was — relax the field so it
      // doesn't sit warped around a ghost pointer.
      window.addEventListener('blur', onLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [reduceMotion]);

  return (
    <motion.div
      aria-hidden
      // Slide, not scaleY: scaling the container stretches the painted dots
      // mid-rise and zeroes the measured height the dot grid is built from.
      className="pointer-events-none fixed inset-x-0 bottom-0 h-[24vh] print:hidden contrast-more:hidden"
      initial={reduceMotion || skipEntrance ? false : { opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      transition={RISE}
    >
      {/* The glow sits UNDER the dots in BOTH schemes — the sunset ink carries
          the color, the glow only warms the ground it sits on. Dark used to lift
          it OVER the field (dark:z-10) to compensate for grey dots; with the
          dots colored again that would only haze them. The reference confirms
          the under-layering: its dot cores sample to the pure stop color
          (#e4581d, no wash on top) while the GAPS between them run warm
          (r−b climbing to +147 against a neutral r−b = 0 canvas). */}
      {/* One glow per scheme rather than one gradient dimmed twice: light's wash
          is tuned against white and is finalized, so it renders untouched, and
          dark gets a tail that actually fades on black (see CORE_GLOW_DARK). */}
      <div aria-hidden className="absolute inset-0 dark:hidden" style={{ background: CORE_GLOW }} />
      <div
        aria-hidden
        className="absolute inset-0 hidden dark:block"
        style={{ background: CORE_GLOW_DARK }}
      />
      <canvas ref={canvasRef} className="relative size-full" />
    </motion.div>
  );
}
