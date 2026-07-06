import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';
import { glideStep } from '@/lib/legal-scrub';
import { termsOfUse } from '@/lib/legal/terms';
import { developerTerms } from '@/lib/legal/developer-terms';
import { privacyPolicy } from '@/lib/legal/privacy';
import type { LegalBlock, LegalDoc } from '@/lib/legal/types';
import { cn } from '@/lib/utils';

/**
 * Public legal/documentation pages (/legal/:slug) on the light Paper canvas —
 * same quiet chrome as /login (mark + Studio top bar, Help & Support), with a
 * document column: switcher pills, title/effective-date/intro, contents list,
 * and numbered sections typeset from the structured LegalDoc data in
 * src/lib/legal/. Publicly reachable on purpose: the login footer links here
 * and visitors must be able to read these before they have an account.
 */

const DOCS: LegalDoc[] = [termsOfUse, developerTerms, privacyPolicy];

/* Entrance — small staggered rises, everything interruptible-safe (opacity/
 * transform only). Skipped wholesale under reduced motion. */
const RISE = {
  t: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  y: 10,
  stagger: 0.07,
};

function sectionId(index: number, heading: string) {
  return `${index + 1}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') {
    return <p className="text-[15px] leading-relaxed text-[#5f5f5f]">{block.text}</p>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="space-y-1.5 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-[#5f5f5f]">
            {/* 11px optical drop centers the dash on the first text line */}
            <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-[#c6c6c6]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="overflow-hidden rounded-xl border border-[#ececec]">
      {block.entries.map((entry, i) => (
        <div
          key={i}
          className={cn(
            'grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4',
            i > 0 && 'border-t border-[#f0f0f0]',
            i % 2 === 1 && 'bg-[#fafafa]',
          )}
        >
          <dt className="text-[13px] font-medium leading-relaxed text-[#111] sm:pt-px sm:text-[14px]">
            {entry.term}
          </dt>
          <dd className="text-[14px] leading-relaxed text-[#5f5f5f]">{entry.def}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegalRoute() {
  const { slug } = useParams();
  const reduceMotion = useReducedMotion();
  const doc = DOCS.find(d => d.slug === slug);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(0);
  // Which tick's label is revealed (hover/focus) — one at a time, never a column.
  const [peekedSection, setPeekedSection] = useState<number | null>(null);
  const [railHovered, setRailHovered] = useState(false);
  // Drag-to-scrub bookkeeping: where the press landed, whether it has crossed
  // into a real drag, and the last row scrubbed to (for the one hash write on
  // release). A ref, not state — pointermove must read/write it without
  // waiting a render.
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startIndex: number;
    dragging: boolean;
    lastIndex: number;
    // Per-section target scrollTops, measured once when the drag begins —
    // the pointer interpolates between them, so mid-drag layout reads stay off
    // the hot path.
    tops: number[] | null;
  } | null>(null);
  // The scrub's glide loop: scrollTop chases `target` a fraction per frame
  // (critically damped — no overshoot), which is what makes the drag feel
  // smooth instead of teleporting per detent. Outlives dragRef so the last
  // glide can settle after release.
  const scrubAnimRef = useRef<{ target: number; factor: number; raf: number } | null>(null);
  const [railDragging, setRailDragging] = useState(false);
  useEffect(() => () => {
    if (scrubAnimRef.current) cancelAnimationFrame(scrubAnimRef.current.raf);
  }, []);
  // Keyboard focus and an in-flight drag engage the rail the same way the
  // pointer does (the drag can wander off the strip while captured).
  const railEngaged = railHovered || peekedSection !== null || railDragging;

  useEffect(() => {
    if (doc) document.title = `${doc.title} · SEEKO Studio`;
  }, [doc]);

  // Deep links: the route owns its scroller, so the browser's native hash
  // jump never fires — honor it manually on arrival. Accepts both the full
  // rail-written id (`#3-cookies`) and the stable bare slug (`#cookies`),
  // so external links survive sections being reordered or renumbered.
  useEffect(() => {
    if (!doc) return;
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!hash) return;
    const index = doc.sections.findIndex((section, i) => {
      const id = sectionId(i, section.heading);
      return id === hash || id.replace(/^\d+-/, '') === hash;
    });
    if (index === -1) return;
    const el = document.getElementById(sectionId(index, doc.sections[index].heading));
    // Instant, not smooth — this is initial placement, not a navigation.
    el?.scrollIntoView({ block: 'start' });
    setActiveSection(index);
  }, [doc]);

  // Scroll-spy for the tick rail: the route owns its scrolling, so we watch
  // the container (not window) and mark the last section whose heading has
  // passed the anchor line. 160px sits just below where scrollIntoView +
  // scroll-mt-28 lands a heading, so a just-jumped-to section counts as
  // active rather than the one before it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !doc) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      // Scrolled to the end → the last section is active even if its heading
      // never crosses the anchor line (short final sections can't).
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        setActiveSection(doc.sections.length - 1);
        return;
      }
      let current = 0;
      doc.sections.forEach((section, i) => {
        const el = document.getElementById(sectionId(i, section.heading));
        if (el && el.getBoundingClientRect().top <= 160) current = i;
      });
      setActiveSection(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [doc]);

  if (!doc) return <Navigate to="/legal/terms" replace />;

  const jumpTo = (index: number) => {
    const el = document.getElementById(sectionId(index, doc.sections[index].heading));
    if (!el) return;
    // Optimistic: mark the destination now; the scroll-spy confirms on settle.
    setActiveSection(index);
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${sectionId(index, doc.sections[index].heading)}`);
  };

  // Drag-to-scrub: which rail row sits under the pointer. Rect math (height /
  // row count, every row is the same 12px band) rather than per-row hit
  // testing, so the rail's 1.25× engaged scale is accounted for free.
  const railIndexAt = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const row = rect.height / doc.sections.length;
    return Math.min(doc.sections.length - 1, Math.max(0, Math.floor((clientY - rect.top) / row)));
  };

  // Where scrollIntoView would land each section (scroll-mt-28 = 112px below
  // the scroller top), clamped to the reachable range. Measured once per drag.
  const measureSectionTops = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const scrollerTop = scroller.getBoundingClientRect().top;
    return doc.sections.map((section, i) => {
      const el = document.getElementById(sectionId(i, section.heading));
      if (!el) return 0;
      const top = scroller.scrollTop + el.getBoundingClientRect().top - scrollerTop - 112;
      return Math.min(max, Math.max(0, top));
    });
  };

  const startScrubGlide = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (scrubAnimRef.current) cancelAnimationFrame(scrubAnimRef.current.raf);
    // 0.22/frame ≈ 65ms time constant at 60fps: tight enough to feel wired to
    // the hand, soft enough to swallow the high gearing where one 12px rail
    // row spans a long section. Reduced motion tracks 1:1 instead of gliding.
    const anim = { target: scroller.scrollTop, factor: reduceMotion ? 1 : 0.22, raf: 0 };
    scrubAnimRef.current = anim;
    const tick = () => {
      const el = scrollerRef.current;
      if (!el || scrubAnimRef.current !== anim) return;
      // glideStep stops the loop the instant the pointer is released (dragging
      // false) WITHOUT touching scroll on that frame, so the settle never fights
      // the user's own scroll. While held, it chases `target` and idles on it.
      const { scrollTop, done } = glideStep(el.scrollTop, anim.target, anim.factor, !!dragRef.current?.dragging);
      if (done) {
        scrubAnimRef.current = null;
        return;
      }
      el.scrollTop = scrollTop;
      anim.raf = requestAnimationFrame(tick);
    };
    anim.raf = requestAnimationFrame(tick);
  };

  // Continuous scrub: the pointer's position along the rail (row centers =
  // whole numbers) interpolates piecewise-linearly between section tops, and
  // the glide loop above chases it. The label still detents to the nearest
  // row; the active tick follows the real scroll via the scroll-spy. The hash
  // is written once on release, not per detent (jumpTo owns clicks).
  const scrubMove = (clientY: number) => {
    const drag = dragRef.current;
    const rail = railRef.current;
    const anim = scrubAnimRef.current;
    if (!drag?.tops || !rail || !anim) return;
    const rect = rail.getBoundingClientRect();
    const rowH = rect.height / doc.sections.length;
    const p = Math.min(doc.sections.length - 1, Math.max(0, (clientY - rect.top) / rowH - 0.5));
    const i = Math.max(0, Math.min(doc.sections.length - 2, Math.floor(p)));
    anim.target =
      doc.sections.length < 2 ? drag.tops[0] : drag.tops[i] + (drag.tops[i + 1] - drag.tops[i]) * (p - i);
    const nearest = Math.round(p);
    if (nearest !== drag.lastIndex) {
      drag.lastIndex = nearest;
      setPeekedSection(nearest);
    }
  };

  // Ends a rail scrub. Bound to pointerup / pointercancel AND lostpointercapture,
  // so a release the pointer events miss (mouse let go outside the window, capture
  // yanked away) still tears the drag down. Idempotent: once dragRef is cleared the
  // guard below early-returns, so the duplicate lostpointercapture fire is a no-op.
  const endRailDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    // Stop the glide loop the moment the pointer leaves. It must never keep
    // owning scrollTop past release — the settle chase would fight the user's
    // own scroll and the page reads as locked. Land instantly on the scrubbed
    // position instead, then hand scroll control back.
    const anim = scrubAnimRef.current;
    if (anim) {
      cancelAnimationFrame(anim.raf);
      scrubAnimRef.current = null;
      const scroller = scrollerRef.current;
      if (drag.dragging && scroller) scroller.scrollTop = anim.target;
    }
    if (!drag.dragging) return; // stationary press — the button's onClick owns it
    setRailDragging(false);
    const landed = drag.lastIndex >= 0 ? drag.lastIndex : drag.startIndex;
    history.replaceState(null, '', `#${sectionId(landed, doc.sections[landed].heading)}`);
    // If the drag let go off the strip, tidy the hover states ourselves —
    // mouseleave fired mid-capture (or never fires, for touch).
    const rect = e.currentTarget.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      setRailHovered(false);
      setPeekedSection(null);
    }
  };

  const rise = (order: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: RISE.y },
          animate: { opacity: 1, y: 0 },
          transition: { ...RISE.t, delay: order * RISE.stagger },
        };

  return (
    <div
      ref={scrollerRef}
      className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges]"
    >
      {/* Top bar — same geometry as /login so the two pages read as one place */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <Link
          to="/login"
          className="flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-70"
        >
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </Link>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20legal%20question"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      {/* Tick rail — sticky left-margin section navigator (wide screens only;
          narrow screens keep the in-flow Contents card). Ticks only — the full
          section list is never printed on screen; hovering or focusing a tick
          reveals just that section's label (spring in, quiet fade out), and
          clicking jumps within the route's own scroll container.

          The whole rail expands on hover: entering it anywhere magnifies the
          rail 25% (scale, left-anchored so it grows into the page) AND grows
          every tick (14 → 22px), peeked/active longest (28px). A single
          tick's 10px change was invisible in practice — the component-level
          magnification is what makes the hover unmistakable.

          It also scrubs like a dial: press and drag along the ticks and the
          document glides with the pointer (continuous position → interpolated
          section offsets → damped chase), the label detenting to the nearest
          row. The press only becomes a drag once it crosses into another row,
          so a stationary press still falls through to the button's onClick
          (and its smooth scroll). Pointer capture starts at the same moment,
          which also swallows the synthetic click that would otherwise
          re-jump. */}
      <motion.nav
        aria-label="Sections"
        className="fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 print:hidden xl:block sm:left-10"
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => {
          setRailHovered(false);
          setPeekedSection(null);
        }}
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, x: -8 },
              animate: { opacity: 1, x: 0 },
              transition: { ...RISE.t, delay: 2 * RISE.stagger },
            })}
      >
        {/* Inner wrapper owns the hover magnification so it composes with the
            nav's entrance animation. origin-left keeps the rail pinned to the
            margin while it scales; ticks, spacing, and label all magnify. */}
        <motion.div
          ref={railRef}
          // touch-none: a touch drag on the strip scrubs instead of scrolling
          // the page; select-none keeps a mouse scrub from starting a text
          // selection in the document beside it.
          className={cn(
            'relative flex origin-left touch-none select-none flex-col',
            railDragging && 'cursor-grabbing **:cursor-grabbing',
          )}
          animate={{ scale: railEngaged ? 1.25 : 1 }}
          transition={reduceMotion ? { duration: 0 } : springs.snappy}
          initial={false}
          onPointerDown={e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            dragRef.current = {
              pointerId: e.pointerId,
              startIndex: railIndexAt(e.clientY),
              dragging: false,
              lastIndex: -1,
              tops: null,
            };
          }}
          onPointerMove={e => {
            const drag = dragRef.current;
            if (!drag || e.pointerId !== drag.pointerId) return;
            if (!drag.dragging) {
              if (railIndexAt(e.clientY) === drag.startIndex) return;
              drag.dragging = true;
              drag.tops = measureSectionTops();
              setRailDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              startScrubGlide();
            }
            scrubMove(e.clientY);
          }}
          onPointerUp={endRailDrag}
          onPointerCancel={endRailDrag}
          onLostPointerCapture={endRailDrag}
        >
        {doc.sections.map((section, i) => (
          <button
            key={i}
            type="button"
            onClick={() => jumpTo(i)}
            onMouseEnter={() => setPeekedSection(i)}
            onFocus={() => setPeekedSection(i)}
            onBlur={() => setPeekedSection(null)}
            aria-label={`Section ${i + 1}: ${section.heading}`}
            aria-current={i === activeSection ? 'true' : undefined}
            // w-36 = generous invisible hit strip: the tick is a 14px sliver,
            // so hovering anywhere in the margin band next to it must count.
            className="group/tick relative flex w-36 items-center py-[5px]"
          >
            {/* Three tiers: peeked/active tick is longest, siblings all grow
                while the rail is engaged, everything rests small otherwise.
                Springs keep the retarget smooth when the cursor sweeps. */}
            <motion.span
              aria-hidden
              className="h-[2px] rounded-full"
              animate={{
                width: i === activeSection || peekedSection === i ? 28 : railEngaged ? 22 : 14,
                backgroundColor:
                  i === activeSection
                    ? '#1c1c1c'
                    : peekedSection === i
                      ? '#8a8a8a'
                      : railEngaged
                        ? '#c9c9c9'
                        : '#dcdcdc',
              }}
              transition={reduceMotion ? { duration: 0 } : springs.snappy}
              initial={false}
            />
          </button>
        ))}
        {/* ONE label for the whole rail, sliding to the hovered row (12px per
            row: 2px tick + 5px padding each side). Sweeping across sections
            swaps the text in place while the spring carries the movement — no
            per-section enter/exit (the old per-tick blur cascade read as
            flicker). It only fades in/out at the rail boundary. */}
        <AnimatePresence>
          {peekedSection !== null && (
            <motion.span
              initial={
                reduceMotion
                  ? { opacity: 1, y: peekedSection * 12 }
                  : { opacity: 0, x: -4, y: peekedSection * 12 }
              }
              animate={{ opacity: 1, x: 0, y: peekedSection * 12 }}
              exit={{ opacity: 0, transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' } }}
              transition={reduceMotion ? { duration: 0 } : springs.snappy}
              className={cn(
                'pointer-events-none absolute left-10 top-0 flex h-3 max-w-[320px] items-center text-[12px] leading-none',
                peekedSection === activeSection ? 'font-medium text-[#1c1c1c]' : 'text-[#5f5f5f]',
              )}
            >
              <span className="truncate whitespace-nowrap">{doc.sections[peekedSection].heading}</span>
            </motion.span>
          )}
        </AnimatePresence>
        </motion.div>
      </motion.nav>

      <main className="mx-auto w-full max-w-[680px] pb-24 pt-32 sm:pt-36">
        {/* Document switcher — pill per document, current one filled */}
        <motion.nav aria-label="Legal documents" className="flex flex-wrap gap-1.5" {...rise(0)}>
          {DOCS.map(d => (
            <Link
              key={d.slug}
              to={`/legal/${d.slug}`}
              aria-current={d.slug === doc.slug ? 'page' : undefined}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                d.slug === doc.slug
                  ? 'bg-[#f1f1f1] text-[#3a3a3a]'
                  : 'text-[#909090] hover:bg-[#f7f7f7] hover:text-[#5f5f5f]',
              )}
            >
              {d.shortTitle}
            </Link>
          ))}
        </motion.nav>

        <motion.div className="mt-8" {...rise(1)}>
          <h1 className="text-balance text-[28px] font-semibold tracking-[-0.02em] text-[#1c1c1c]">
            {doc.title}
          </h1>
          <p className="mt-2 text-[13px] font-medium tabular-nums text-[#969696]">
            Effective {doc.effectiveDate}
          </p>
          <p className="mt-5 text-pretty text-base leading-relaxed text-[#6e6e6e]">{doc.intro}</p>
        </motion.div>

        {/* Contents — quick anchors for screens too narrow for the tick rail;
            numbers in tabular figures so the column aligns */}
        <motion.nav
          aria-label="Contents"
          className="mt-9 rounded-2xl bg-[#fafafa] px-5 py-4 xl:hidden"
          {...rise(2)}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a0a0a0]">
            Contents
          </p>
          <ol className="mt-2.5 columns-1 gap-8 sm:columns-2">
            {doc.sections.map((section, i) => (
              <li key={i} className="break-inside-avoid">
                <a
                  href={`#${sectionId(i, section.heading)}`}
                  className="flex gap-2 py-[3px] text-[13.5px] leading-snug text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]"
                >
                  <span className="w-5 shrink-0 tabular-nums text-[#b0b0b0]">{i + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </motion.nav>

        <motion.article className="mt-12 space-y-10" {...rise(3)}>
          {doc.sections.map((section, i) => (
            <section key={i} id={sectionId(i, section.heading)} className="scroll-mt-28">
              <h2 className="flex gap-3 text-[16px] font-semibold text-[#1c1c1c]">
                <span className="tabular-nums text-[#c0c0c0]">{i + 1}</span>
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 pl-[30px]">
                {section.body.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </div>
            </section>
          ))}
        </motion.article>

        <motion.footer
          className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] pt-6"
          {...rise(4)}
        >
          <p className="text-[13px] text-[#a0a0a0]">SEEKO Studio</p>
          <Link
            to="/login"
            className="text-[13px] font-medium text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]"
          >
            Back to sign in
          </Link>
        </motion.footer>
      </main>
    </div>
  );
}
