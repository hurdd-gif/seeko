import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { useDialKit, DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import { BTN_BASE } from '@/components/dashboard/lightKit';

/* ─────────────────────────────────────────────────────────────────────────
 * MAGNETIC DOT-GRID 404 — cursor-driven reveal
 *
 *   A field of dots covers the numeral area. Dots that fall on the "404"
 *   glyphs carry colour (ink 4s, azure 0) and sit faint at rest; as the
 *   cursor nears, nearby dots swell + brighten, so moving the pointer
 *   sculpts the numerals out of the field. A one-time intro sweep lights
 *   the 404 left→right on mount, then hands off to the live pointer.
 *
 *   Layering by best tool:
 *     • canvas + rAF   → the reactive dot field (eased per-dot lerp gives
 *                        the spring-like "wave"; 60fps, GPU-cheap)
 *     • Motion (DOM)   → headline/copy/CTA staggered entrance
 *
 *   Live tuning: on the dev server only, a DialKit panel (top-right) drives
 *   every value below — colours, grid density, motion, dot sizes, page bg.
 *   `FIELD` stays the single source of truth: DialKit seeds its controls from
 *   it, and in tests/production (no DialRoot) useDialKit returns these exact
 *   defaults, so the page renders identically to the un-instrumented version.
 *
 *   Fallback (always reachable): touch / no-hover / reduced-motion render
 *   the full 404 statically and skip all pointer wiring.
 * ───────────────────────────────────────────────────────────────────────── */

// Canonical defaults — the single source of truth for the dot field.
const FIELD = {
  cell: 10, // px between dot centres (CSS units)
  aspect: 0.65, // canvas height = width * aspect
  influence: 218, // px radius of cursor influence
  ease: 0.24, // per-dot easing toward target (wave feel)
  follow: 0.37, // virtual cursor easing toward target
  introMs: 1250, // intro sweep duration
  ink: '#0e7aff', // 4s (blue on the dark field)
  azure: '#0d7aff', // 0
  bg: '#000000', // page background (dark 404)
  // glyph dots read as a faint blue 404 at rest; the cursor blazes them to
  // full. bg dots stay a quiet textural field.
  glyph: { restAlpha: 0.32, baseR: 1.2, maxR: 5.3 },
  bgDot: { restAlpha: 0.09, baseR: 1.7, maxR: 2.0, gain: 0.12 },
} as const;

// Dev-only: show the live tuning panel on the dev server, never in tests/prod.
// `import.meta.hot` is defined by Vite's dev server (HMR), statically undefined
// in production builds, and absent under Vitest — so dials show only while
// developing, and the panel + dialkit import dead-code-eliminate from prod.
const SHOW_DIALS = Boolean(import.meta.hot);

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// Dark-surface buttons. Same canonical pill geometry as the design system
// (BTN_BASE — rounded-full, h-9, scoped transition, active:scale), recoloured
// for the black 404: the primary inverts to a white pill, the secondary is a
// quiet translucent pill. Reusing BTN_BASE keeps press feedback + sizing in
// lockstep with the app's buttons.
const BTN_DARK_PRIMARY = `${BTN_BASE} bg-surface-1 text-ink-title hover:bg-white/90`;
const BTN_DARK_SECONDARY = `${BTN_BASE} bg-white/[0.08] text-[#f5f5f5] hover:bg-white/[0.14]`;

const TAU = Math.PI * 2;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Live field configuration (DialKit-driven in dev, FIELD defaults otherwise).
type FieldCfg = {
  cell: number;
  aspect: number;
  influence: number;
  ease: number;
  follow: number;
  introMs: number;
  ink: string;
  azure: string;
  glyph: { restA: number; baseR: number; maxR: number };
  bg: { restA: number; baseR: number; maxR: number; gain: number };
};

// Colour resolves live from cfg (not baked in), so ink/azure changes need no
// rebuild — only cell/aspect (grid density) do.
type Dot = { x: number; y: number; glyph: boolean; azure: boolean; a: number; r: number };

/**
 * Sample "404" into an offscreen buffer and turn covered cells into dots.
 * The two 4s are drawn into the red channel, the 0 into the blue channel, so
 * one readback tags each dot's glyph + which colour it carries. Returns [] if
 * 2D canvas is unavailable (e.g. jsdom under test) so the effect no-ops safely.
 */
function buildDots(w: number, h: number, cell: number): Dot[] {
  if (typeof document === 'undefined') return [];
  try {
    const buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    const bx = buf.getContext('2d', { willReadFrequently: true });
    if (!bx) return [];

    const size = h * 0.92;
    bx.textBaseline = 'middle';
    bx.font = `500 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const gap = size * 0.16;
    const w4 = bx.measureText('4').width;
    const w0 = bx.measureText('0').width;
    const total = w4 * 2 + w0 + gap * 2;
    let x = (w - total) / 2;
    const midY = h / 2;

    bx.fillStyle = 'rgb(255,0,0)'; // left 4 → red
    bx.fillText('4', x, midY);
    x += w4 + gap;
    bx.fillStyle = 'rgb(0,0,255)'; // 0 → blue
    bx.fillText('0', x, midY);
    x += w0 + gap;
    bx.fillStyle = 'rgb(255,0,0)'; // right 4 → red
    bx.fillText('4', x, midY);

    const img = bx.getImageData(0, 0, w, h).data;
    const dots: Dot[] = [];
    for (let py = cell / 2; py < h; py += cell) {
      for (let px = cell / 2; px < w; px += cell) {
        const i = (Math.floor(py) * w + Math.floor(px)) * 4;
        const red = img[i];
        const blue = img[i + 2];
        const cover = Math.max(red, blue) / 255;
        const glyph = cover > 0.35;
        dots.push({ x: px, y: py, glyph, azure: glyph && blue > red, a: 0, r: 0 });
      }
    }
    return dots;
  } catch {
    return [];
  }
}

function DotField404({ interactive, cfg }: { interactive: boolean; cfg: FieldCfg }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The rAF loop reads live values through this ref, so DialKit edits to
  // colours / motion / dot sizes apply mid-flight without restarting it.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return; // jsdom / unsupported → static aria-only canvas

    let dots: Dot[] = [];
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    // Animated "virtual" cursor + its target. Off-canvas target = field at rest.
    const target = { x: -9999, y: -9999 };
    const cur = { x: -9999, y: -9999 };
    let introStart = 0;
    let introDone = !interactive; // static fallback skips the sweep
    let pointerSeen = false;

    const colorOf = (d: Dot) => {
      const c = cfgRef.current;
      return d.glyph ? (d.azure ? c.azure : c.ink) : c.ink;
    };

    const measure = () => {
      const c = cfgRef.current;
      const rect = canvas.getBoundingClientRect();
      cssW = Math.round(rect.width);
      cssH = Math.round(cssW * c.aspect);
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = buildDots(cssW, cssH, c.cell);
      for (const d of dots) {
        const set = d.glyph ? c.glyph : c.bg;
        d.a = set.restA;
        d.r = set.baseR;
      }
    };

    const paint = () => {
      const c = cfgRef.current;
      const glyphGain = 1 - c.glyph.restA;
      ctx.clearRect(0, 0, cssW, cssH);
      for (const d of dots) {
        const dx = d.x - cur.x;
        const dy = d.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const infl = clamp01(1 - dist / c.influence) ** 2;
        const set = d.glyph ? c.glyph : c.bg;
        const gain = d.glyph ? glyphGain : c.bg.gain;
        const tR = set.baseR + infl * (set.maxR - set.baseR);
        const tA = set.restA + infl * gain;
        d.r += (tR - d.r) * c.ease;
        d.a += (tA - d.a) * c.ease;
        if (d.a <= 0.001) continue;
        ctx.globalAlpha = d.a;
        ctx.fillStyle = colorOf(d);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // Static fallback: settle every glyph dot to full, paint once, done.
    if (!interactive) {
      measure();
      if (!dots.length) return; // canvas unsupported (e.g. test env) → DOM-only
      const c = cfgRef.current;
      for (const d of dots) {
        const set = d.glyph ? c.glyph : c.bg;
        d.a = d.glyph ? 0.92 : set.restA;
        d.r = d.glyph ? set.maxR * 0.74 : set.baseR;
      }
      ctx.clearRect(0, 0, cssW, cssH);
      for (const d of dots) {
        ctx.globalAlpha = d.a;
        ctx.fillStyle = colorOf(d);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const loop = (t: number) => {
      const c = cfgRef.current;
      if (!introStart) introStart = t;
      if (!introDone && !pointerSeen) {
        const p = clamp01((t - introStart) / c.introMs);
        target.x = easeInOut(p) * cssW;
        target.y = cssH / 2;
        if (p >= 1) {
          introDone = true;
          target.x = -9999; // retreat → invites the user to move
          target.y = -9999;
        }
      }
      cur.x += (target.x - cur.x) * c.follow;
      cur.y += (target.y - cur.y) * c.follow;
      paint();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      pointerSeen = true;
      introDone = true;
      const rect = canvas.getBoundingClientRect();
      target.x = e.clientX - rect.left;
      target.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      target.x = -9999;
      target.y = -9999;
    };

    measure();
    if (!dots.length) return; // canvas unsupported (e.g. test env) → DOM-only
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(canvas);
    window.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
    // Rebuild only on grid-density change; every other value flows via cfgRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, cfg.cell, cfg.aspect]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="404"
      // Width is the smaller of a width budget (92vw, capped 720px) and a
      // height budget: with height = width × aspect, clamping width by
      // (viewport height − room for the copy/CTAs) guarantees the whole
      // composition fits on short windows instead of clipping. `dvh` keeps it
      // honest on mobile browser chrome.
      style={{ width: `min(92vw, 720px, calc((100dvh - 340px) / ${cfg.aspect}))` }}
      className="select-none"
    />
  );
}

export function NotFoundRoute() {
  return <NotFoundContent />;
}

export function NotFoundContent() {
  const reduce = useReducedMotion();

  // Live tuning panel (dev only). FIELD supplies every default, so production —
  // where DialRoot is absent and useDialKit returns these defaults — is
  // identical to a hand-coded version.
  const dk = useDialKit('404 Dot-Grid', {
    colors: {
      background: { type: 'color', default: FIELD.bg },
      ink: { type: 'color', default: FIELD.ink },
      azure: { type: 'color', default: FIELD.azure },
    },
    grid: {
      cell: [FIELD.cell, 8, 28, 1],
      aspect: [FIELD.aspect, 0.3, 0.65, 0.01],
    },
    motion: {
      influence: [FIELD.influence, 40, 320, 1],
      ease: [FIELD.ease, 0.02, 0.5, 0.01],
      follow: [FIELD.follow, 0.02, 0.6, 0.01],
      introMs: [FIELD.introMs, 0, 3000, 50],
    },
    glyphDots: {
      restAlpha: [FIELD.glyph.restAlpha, 0, 1, 0.01],
      baseR: [FIELD.glyph.baseR, 0.3, 5, 0.1],
      maxR: [FIELD.glyph.maxR, 1, 12, 0.1],
    },
    bgDots: {
      restAlpha: [FIELD.bgDot.restAlpha, 0, 0.4, 0.01],
      baseR: [FIELD.bgDot.baseR, 0.2, 4, 0.1],
      maxR: [FIELD.bgDot.maxR, 0.5, 6, 0.1],
      gain: [FIELD.bgDot.gain, 0, 1, 0.01],
    },
  });

  const cfg: FieldCfg = {
    cell: dk.grid.cell,
    aspect: dk.grid.aspect,
    influence: dk.motion.influence,
    ease: dk.motion.ease,
    follow: dk.motion.follow,
    introMs: dk.motion.introMs,
    ink: dk.colors.ink,
    azure: dk.colors.azure,
    glyph: { restA: dk.glyphDots.restAlpha, baseR: dk.glyphDots.baseR, maxR: dk.glyphDots.maxR },
    bg: {
      restA: dk.bgDots.restAlpha,
      baseR: dk.bgDots.baseR,
      maxR: dk.bgDots.maxR,
      gain: dk.bgDots.gain,
    },
  };

  // Cursor reveal is a progressive enhancement: only on hover-capable, fine
  // pointers without a reduced-motion preference. Everyone else gets the
  // static full 404 below.
  const canHover =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : false;
  const interactive = canHover && !reduce;

  // Section-level entrance: mark → copy → CTAs (staggered fade-up).
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
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
    <div
      className="flex min-h-screen items-center justify-center px-6 py-12 text-[#f5f5f5] antialiased"
      style={{ backgroundColor: SHOW_DIALS ? dk.colors.background : FIELD.bg }}
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col items-center gap-7"
      >
        <motion.div variants={item}>
          <DotField404 interactive={interactive} cfg={cfg} />
        </motion.div>

        <motion.div variants={item} className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-balance text-[clamp(22px,2.4vw,28px)] font-semibold text-[#f5f5f5]">
            This page wandered off the map
          </h1>
          <p className="max-w-md text-pretty text-[14px] leading-relaxed text-[#a3a3a3]">
            The page you’re looking for doesn’t exist or was moved. Let’s get you back on track.
          </p>
          {/* Dark-surface pills: canonical BTN_BASE geometry recoloured for the
              black field — white primary, translucent secondary. Focus ring
              offsets against black. */}
          <div className="mt-1 flex items-center gap-3">
            <Link to="/tasks" className={`${BTN_DARK_PRIMARY} ${FOCUS_RING}`}>
              Back to tasks
            </Link>
            <Link to="/docs" className={`${BTN_DARK_SECONDARY} ${FOCUS_RING}`}>
              Open docs
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {SHOW_DIALS ? <DialRoot position="top-right" /> : null}
    </div>
  );
}
