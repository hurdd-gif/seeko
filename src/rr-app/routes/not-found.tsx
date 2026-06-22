import { useRef } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { BTN_PRIMARY } from '@/components/dashboard/lightKit';

const NUMERAL_4 = 'M120 0 L40 130 L160 130 M120 0 L120 200';

// Shared glyph geometry — referenced by BOTH the faint static "ghost" guide and
// the scroll-drawn strokes so the two layers can never drift out of register.
const GLYPH = {
  left4: { d: NUMERAL_4, transform: 'translate(40 20)' },
  zero: { cx: 80, cy: 100, rx: 70, ry: 100, transform: 'translate(230 20)' },
  right4: { d: NUMERAL_4, transform: 'translate(420 20)' },
} as const;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ov-bg)]';

export function NotFoundRoute() {
  return <NotFoundContent />;
}

export function NotFoundContent() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });

  const draw4L = useTransform(progress, [0.0, 0.4], [0, 1]);
  const draw0 = useTransform(progress, [0.2, 0.6], [0, 1]);
  const draw4R = useTransform(progress, [0.4, 0.8], [0, 1]);
  const copyOpacity = useTransform(progress, [0.62, 0.95], [0, 1]);
  const copyY = useTransform(progress, [0.62, 0.95], [14, 0]);
  const hintOpacity = useTransform(progress, [0.0, 0.12], [1, 0]);

  // Reduced motion: render fully-drawn numerals + visible copy, no scrub, no hint.
  const pl4L = reduce ? 1 : draw4L;
  const pl0 = reduce ? 1 : draw0;
  const pl4R = reduce ? 1 : draw4R;

  return (
    <div className="overview-light min-h-[220vh] bg-[var(--ov-bg)] text-[#111] antialiased">
      <div ref={trackRef} className="relative h-[220vh]">
        <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-7 px-6">
          <p className="font-mono text-[12px] font-medium tracking-[0.18em] text-[#808080]">
            ERROR · 404
          </p>

          <svg
            viewBox="0 0 620 240"
            role="img"
            aria-label="404"
            className="w-[min(86vw,560px)]"
            fill="none"
            stroke="#111"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Ghost guide: the full 404 at rest, so the shape reads before it's
              * drawn and the strokes trace over a visible path. Covered by the
              * solid strokes at full draw (incl. reduced motion). */}
            <g stroke="#111" opacity={0.1} aria-hidden>
              <path {...GLYPH.left4} vectorEffect="non-scaling-stroke" />
              <ellipse {...GLYPH.zero} vectorEffect="non-scaling-stroke" />
              <path {...GLYPH.right4} vectorEffect="non-scaling-stroke" />
            </g>
            <motion.path
              {...GLYPH.left4}
              style={{ pathLength: pl4L }}
              vectorEffect="non-scaling-stroke"
            />
            <motion.ellipse
              {...GLYPH.zero}
              stroke="#0d7aff"
              style={{ pathLength: pl0 }}
              vectorEffect="non-scaling-stroke"
            />
            <motion.path
              {...GLYPH.right4}
              style={{ pathLength: pl4R }}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <motion.div
            className="flex flex-col items-center gap-4 text-center"
            style={{ opacity: reduce ? 1 : copyOpacity, y: reduce ? 0 : copyY }}
          >
            <h1 className="text-[clamp(22px,2.4vw,28px)] font-semibold text-[#111]">
              This page wandered off the map
            </h1>
            <p className="max-w-md text-[14px] leading-relaxed text-[#505050]">
              The page you’re looking for doesn’t exist or was moved. Let’s get you back on track.
            </p>
            <div className="mt-1 flex items-center gap-5">
              <Link to="/tasks" className={`${BTN_PRIMARY} ${FOCUS_RING} active:scale-[0.98]`}>
                Back to tasks
              </Link>
              <Link
                to="/docs"
                className={`text-[14px] font-medium text-[#505050] underline-offset-4 transition-colors hover:text-[#111] hover:underline ${FOCUS_RING}`}
              >
                Open docs
              </Link>
            </div>
          </motion.div>

          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-10 flex flex-col items-center gap-1 text-[#9a9a9a]"
            style={{ opacity: reduce ? 0 : hintOpacity }}
          >
            <span className="font-mono text-[11px] tracking-[0.16em]">SCROLL</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
