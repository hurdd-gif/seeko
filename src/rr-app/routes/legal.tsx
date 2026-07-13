import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { springs } from '@/lib/motion';
import { startScrollGlide, type ScrollGlide } from '@/lib/scroll-glide';
import { termsOfUse } from '@/lib/legal/terms';
import { developerTerms } from '@/lib/legal/developer-terms';
import { privacyPolicy } from '@/lib/legal/privacy';
import type { LegalBlock, LegalDoc } from '@/lib/legal/types';
import { useIsDark } from '@/lib/theme';
import { usePublicViewTransition } from '@/lib/view-transitions';
import { PublicLink, TOUCH_TARGET } from '@/components/public/PublicLink';
import { cn } from '@/lib/utils';

/**
 * Public legal/documentation pages (/legal/:slug) on the Paper canvas (white,
 * or the shared #171717 public dark canvas under .dark) — same quiet chrome as
 * /login (mark + Studio top bar, Help & Support), with a
 * document column: switcher pills, title/effective-date/intro, contents list,
 * and numbered sections typeset from the structured LegalDoc data in
 * src/lib/legal/. Publicly reachable on purpose: the login footer links here
 * and visitors must be able to read these before they have an account.
 */

const DOCS: LegalDoc[] = [termsOfUse, developerTerms, privacyPolicy];

const RAIL_INTRO_KEY = 'seeko-legal-rail-introduced';

/* Entrance — small staggered rises, everything interruptible-safe (opacity/
 * transform only). Skipped wholesale under reduced motion. */
const RISE = {
  t: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  y: 10,
  stagger: 0.07,
};

/* Rubberband give at the dial's ends: dragging past the first/last row keeps
 * pulling the rail, but with asymptotic resistance (Apple's curve from the
 * Designing Fluid Interfaces sample code) — and a hard frame-lock at one tick
 * row of travel (user call: the unclamped curve let a long pull drag the rail
 * ~50px). The curve gives progressively up to ~7 rows of overshoot, then the
 * stretch pins at RAIL_MAX_STRETCH however far the hand keeps going. The
 * document shares the gesture: it overscrolls PAGE_STRETCH × the rail's
 * travel in the scroll direction, so both surfaces lock on the same frame. */
/* Tick colors are Motion-animated JS hexes (backgroundColor springs between
 * the four engagement tiers), unreachable by dark: classes — the component
 * picks the map with useIsDark(). Dark mirrors the light hierarchy on the
 * #171717 canvas: active = the dark strong ink, resting = a recessive #3e3e3e.
 *
 * That #3e3e3e used to be justified by "it's what the login header chrome pins
 * to" — no longer true, the header labels were lifted to ink-faint because at
 * 1.68:1 they failed WCAG. It stays here anyway, on different grounds: a RESTING
 * tick carries no information (it's the unengaged state of a decorative scroll
 * rail), so the 3:1 graphic floor doesn't bind it. The tiers that DO carry
 * meaning — peeked/active — sit well above it. Don't "fix" this to match the
 * header; they're answering different questions. */
const TICK_COLORS = {
  light: { active: '#1c1c1c', peeked: '#8a8a8a', engaged: '#c9c9c9', rest: '#dcdcdc' },
  dark: { active: '#e4e4e4', peeked: '#959595', engaged: '#4f4f4f', rest: '#3e3e3e' },
};

const RAIL_GIVE = 0.15;
const RAIL_MAX_STRETCH = 12;
const PAGE_STRETCH = 2.5;
function rubberband(overshoot: number, dimension: number) {
  const pull = (overshoot * dimension * RAIL_GIVE) / (dimension + RAIL_GIVE * Math.abs(overshoot));
  return Math.max(-RAIL_MAX_STRETCH, Math.min(RAIL_MAX_STRETCH, pull));
}

function sectionId(index: number, heading: string) {
  return `${index + 1}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') {
    return <p className="text-[15px] leading-relaxed text-[#5f5f5f] dark:text-[#a3a3a3]">{block.text}</p>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="space-y-1.5 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-[#5f5f5f] dark:text-[#a3a3a3]">
            {/* 11px optical drop centers the dash on the first text line */}
            <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-[#c6c6c6] dark:bg-[#4f4f4f]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="overflow-hidden rounded-xl border border-surface-5">
      {block.entries.map((entry, i) => (
        <div
          key={i}
          className={cn(
            'grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4',
            i > 0 && 'border-t border-[#f0f0f0] dark:border-[#2a2a2a]',
            i % 2 === 1 && 'bg-[#fafafa] dark:bg-[#1f1f1f]',
          )}
        >
          <dt className="text-[13px] font-medium leading-relaxed text-ink-title sm:pt-px sm:text-[14px]">
            {entry.term}
          </dt>
          <dd className="text-[14px] leading-relaxed text-[#5f5f5f] dark:text-[#a3a3a3]">{entry.def}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegalRoute() {
  const { slug } = useParams();
  const reduceMotion = useReducedMotion();
  /* True when the browser is animating this arrival (from /login, from a
     sibling document, or via the back button). It becomes the entrance, so the
     mount-time rise stands down — see `rise()` below. */
  const arrivedViaTransition = usePublicViewTransition();
  const isDark = useIsDark();
  const tick = TICK_COLORS[isDark ? 'dark' : 'light'];
  const doc = DOCS.find(d => d.slug === slug);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(0);
  // Which tick's label is revealed (hover/focus) — one at a time, never a column.
  const [peekedSection, setPeekedSection] = useState<number | null>(null);
  const [railHovered, setRailHovered] = useState(false);
  // One-time discoverability flash (macOS-scrollbar pattern): the rail is a
  // column of 14px slivers — pure chrome until you already know it's a
  // navigator. On first arrival it engages itself and names the current
  // section for a beat, then settles. Once per session, wide screens only.
  const [railIntro, setRailIntro] = useState(false);
  // Mirror for the intro timer: it fires once (empty deps) but must name
  // whatever section a deep link landed on, not a stale closure's 0.
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
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
    // True once the end-stretch has slipped out of the hand (frame-lock
    // reached mid-drag): the band has already snapped home on its own, and
    // stays home until the pointer comes back inside the rows to re-arm.
    slipped: boolean;
  } | null>(null);
  // The scrub's glide loop: scrollTop chases the target a fraction per frame
  // (critically damped — no overshoot), which is what makes the drag feel
  // smooth instead of teleporting per detent. Outlives dragRef so the last
  // glide can settle after release. Lives in src/lib/scroll-glide.ts, where
  // its exit conditions (settled / quantization stall / usurped by the
  // user's own scroll) are unit-tested — a stall used to keep the loop
  // alive forever, pinning scrollTop and locking the page against wheel
  // scroll after a drag.
  const scrubGlideRef = useRef<ScrollGlide | null>(null);
  const [railDragging, setRailDragging] = useState(false);
  // Rubberband displacement of the whole rail (px). A motion value, not
  // state: written per pointermove (1:1 while held, through the resistance
  // curve) and sprung home on release. The return animation is kept so a
  // re-grab mid-flight can stop it and take over from the live value.
  const railShift = useMotionValue(0);
  // The document's share of the overshoot, derived so the two surfaces are
  // one gesture: it stretches, frame-locks, and springs home exactly when
  // the rail does (the release animation on railShift drives both). Negated
  // because the page continues in the SCROLL direction — dial pulled down
  // past the last section keeps carrying the content up, iOS-overscroll
  // style — while the rail follows the hand.
  const pageShift = useTransform(railShift, v => -v * PAGE_STRETCH);
  const railShiftReturn = useRef<{ stop: () => void } | null>(null);
  const releaseRailShift = () => {
    if (railShift.get() === 0) return;
    // springs.snappy is slightly underdamped — the snap home carries a hair
    // of bounce, earned here because the hand's gesture had momentum.
    railShiftReturn.current = animate(railShift, 0, springs.snappy);
  };
  // Scroll-edge signal for the fixed top bar: material appears only once
  // content has actually scrolled beneath the chrome.
  const [scrolledUnder, setScrolledUnder] = useState(false);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => setScrolledUnder(scroller.scrollTop > 8);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  /* Switching documents keeps this component mounted (same route, new param),
     so the scroller kept its scrollTop — read to the bottom of the Terms, click
     Privacy, and you landed halfway down Privacy. It went unnoticed while the
     swap was an instant cut; a transition that lifts the new document into
     place makes it obvious, and lifting it into a position nobody asked for is
     worse than not lifting it at all.
     LAYOUT effect, not passive: React Router commits the DOM swap inside the
     view transition's callback, and the browser snapshots the result as soon as
     that returns. A passive effect can land after the shutter. */
  const settledSlug = useRef(slug);
  useLayoutEffect(() => {
    if (settledSlug.current === slug) return;
    settledSlug.current = slug;
    scrollerRef.current?.scrollTo({ top: 0 });
    setActiveSection(0);
  }, [slug]);

  useEffect(() => () => {
    scrubGlideRef.current?.stop();
    railShiftReturn.current?.stop();
  }, []);
  // The document also rubber-bands at its scroll ends by itself — during
  // normal wheel/trackpad scrolling, not only via the dial (user ask;
  // apple-design: a boundary should resist progressively, and the give
  // belongs to the scroll itself, not just one control). Outward wheel
  // deltas past the pinned edge feed the SAME displacement system as the
  // dial (railShift → page at −PAGE_STRETCH), so both surfaces stretch,
  // hit the same frame-lock, and spring home together. The listener is
  // passive — native scroll already can't pass the edge, so there's
  // nothing to prevent; we only paint the give. A wheel stream has no
  // pointerup: the "let go" is a beat with no outward push (trailing
  // momentum events keep feeding it, so a trackpad fling bounces out and
  // back like iOS). Scrolling back inward releases instantly.
  const wheelOvershoot = useRef(0);
  const wheelSettleTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || reduceMotion) return;
    const WHEEL_SETTLE = 140;
    const onWheel = (e: WheelEvent) => {
      if (dragRef.current?.dragging) return; // the hand on the dial owns the surfaces
      const endTop = scroller.scrollHeight - scroller.clientHeight;
      const pushingOut =
        (e.deltaY < 0 && scroller.scrollTop <= 0) ||
        (e.deltaY > 0 && scroller.scrollTop >= endTop - 1);
      if (pushingOut) {
        const dim = railRef.current?.getBoundingClientRect().height ?? 168;
        // Taking over from an in-flight return (or a dial release): seed the
        // accumulator by inverting the curve at the LIVE value, so the wheel
        // continues from what's on screen instead of snapping back to zero.
        if (wheelOvershoot.current === 0 && railShift.get() !== 0) {
          railShiftReturn.current?.stop();
          const s = railShift.get();
          wheelOvershoot.current = (s * dim) / (RAIL_GIVE * (dim - Math.abs(s)));
        }
        wheelOvershoot.current += e.deltaY;
        railShift.set(rubberband(wheelOvershoot.current, dim));
        window.clearTimeout(wheelSettleTimer.current);
        wheelSettleTimer.current = window.setTimeout(() => {
          wheelOvershoot.current = 0;
          if (!dragRef.current?.dragging) releaseRailShift();
        }, WHEEL_SETTLE);
      } else if (wheelOvershoot.current !== 0) {
        // Direction reversed while stretched: the boundary gives way the
        // moment the push does — no settle wait.
        wheelOvershoot.current = 0;
        window.clearTimeout(wheelSettleTimer.current);
        releaseRailShift();
      }
    };
    scroller.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      window.clearTimeout(wheelSettleTimer.current);
    };
    // Refs and the motion value are stable; releaseRailShift only touches
    // those, so the first-render closure stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);
  // Keyboard focus and an in-flight drag engage the rail the same way the
  // pointer does (the drag can wander off the strip while captured).
  const railEngaged = railHovered || peekedSection !== null || railDragging || railIntro;

  // Intro flash schedule: wait out the entrance stagger, engage + peek the
  // active section, release after a beat. Skipped on repeat visits this
  // session and on screens where the rail is hidden (< xl).
  useEffect(() => {
    if (!doc) return;
    try {
      if (sessionStorage.getItem(RAIL_INTRO_KEY)) return;
    } catch {
      // Storage blocked: still introduce — it just repeats next visit.
    }
    if (!window.matchMedia('(min-width: 80rem)').matches) return;
    const engage = setTimeout(() => {
      try {
        sessionStorage.setItem(RAIL_INTRO_KEY, '1');
      } catch {
        // Non-fatal.
      }
      setRailIntro(true);
      setPeekedSection(activeSectionRef.current);
    }, 900);
    const release = setTimeout(() => {
      setRailIntro(false);
      setPeekedSection(current => (current === activeSectionRef.current ? null : current));
    }, 2700);
    return () => {
      clearTimeout(engage);
      clearTimeout(release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // testing, so the rail's 1.25× engaged scale is accounted for free. The
  // rect rides the rubberband translate — subtract our own shift so the rows
  // are addressed where the rail rests, not where it's stretched to.
  const railIndexAt = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const row = rect.height / doc.sections.length;
    return Math.min(
      doc.sections.length - 1,
      Math.max(0, Math.floor((clientY - (rect.top - railShift.get())) / row)),
    );
  };

  // Where scrollIntoView would land each section (scroll-mt-28 = 112px below
  // the scroller top), clamped to the reachable range. Measured once per drag.
  const measureSectionTops = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const scrollerTop = scroller.getBoundingClientRect().top;
    // A re-grab mid-return measures while the document still carries the
    // overscroll translate — subtract it so tops describe the content at rest.
    const shift = pageShift.get();
    return doc.sections.map((section, i) => {
      const el = document.getElementById(sectionId(i, section.heading));
      if (!el) return 0;
      const top = scroller.scrollTop + el.getBoundingClientRect().top - shift - scrollerTop - 112;
      return Math.min(max, Math.max(0, top));
    });
  };

  const startScrubGlide = () => {
    if (!scrollerRef.current) return;
    scrubGlideRef.current?.stop();
    // 0.22/frame ≈ 65ms time constant at 60fps: tight enough to feel wired to
    // the hand, soft enough to swallow the high gearing where one 12px rail
    // row spans a long section. Reduced motion tracks 1:1 instead of gliding.
    scrubGlideRef.current = startScrollGlide({
      getEl: () => scrollerRef.current,
      isHeld: () => !!dragRef.current?.dragging,
      factor: reduceMotion ? 1 : 0.22,
    });
  };

  // Continuous scrub: the pointer's position along the rail (row centers =
  // whole numbers) interpolates piecewise-linearly between section tops, and
  // the glide loop above chases it. The label still detents to the nearest
  // row; the active tick follows the real scroll via the scroll-spy. The hash
  // is written once on release, not per detent (jumpTo owns clicks).
  const scrubMove = (clientY: number) => {
    const drag = dragRef.current;
    const rail = railRef.current;
    const glide = scrubGlideRef.current;
    if (!drag?.tops || !rail || !glide) return;
    const rect = rail.getBoundingClientRect();
    // Unwind our own rubberband translate so the overshoot can't feed back
    // into itself (the stretch would otherwise chase the moving rail).
    const top = rect.top - railShift.get();
    const rowH = rect.height / doc.sections.length;
    const max = doc.sections.length - 1;
    const raw = (clientY - top) / rowH - 0.5;
    const p = Math.min(max, Math.max(0, raw));
    const i = Math.max(0, Math.min(doc.sections.length - 2, Math.floor(p)));
    glide.retarget(
      doc.sections.length < 2 ? drag.tops[0] : drag.tops[i] + (drag.tops[i + 1] - drag.tops[i]) * (p - i),
    );
    // Past either end the pointer stops moving the document (p is clamped
    // above) and starts stretching the rail instead — the dial's physical
    // "you're at the stop". Tracks the hand 1:1 through the resistance curve
    // until the stretch reaches the frame-lock — then the band SLIPS out of
    // the hand and snaps home by itself, mid-drag, no release needed (user
    // call: the snap must not wait for letting go). Once slipped it stays
    // home however far the hand keeps going; coming back inside the rows
    // re-arms it, so a fresh pull past the end stretches (and can slip)
    // again. endRailDrag still springs home a part-way stretch on release.
    // Skipped under reduced motion (the pin at the first/last section
    // already communicates the boundary).
    if (!reduceMotion) {
      const overshootPx = (raw < 0 ? raw : raw > max ? raw - max : 0) * rowH;
      if (drag.slipped) {
        if (overshootPx === 0) drag.slipped = false;
      } else {
        const pull = rubberband(overshootPx, rect.height);
        if (Math.abs(pull) >= RAIL_MAX_STRETCH) {
          drag.slipped = true;
          releaseRailShift();
        } else {
          railShift.set(pull);
        }
      }
    }
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
    if (!drag.dragging) return; // stationary press — the button's onClick owns it
    setRailDragging(false);
    releaseRailShift();
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

  /* The staggered rise is the COLD-LOAD entrance — a deep link, a refresh, a
     paste of the URL. It must stand down when the browser is view-transitioning
     us in from /login or from a sibling document, and not because two
     animations would fight: a view transition photographs the arriving page the
     instant the DOM commits, so a column whose sections all start at opacity 0
     gets captured blank, plays the whole transition blank, and pops in only
     once the browser hands control back. Whichever mechanism owns the arrival
     owns it alone. (globals.css defines what the transition does instead.) */
  const rise = (order: number) =>
    reduceMotion || arrivedViaTransition
      ? {}
      : {
          initial: { opacity: 0, y: RISE.y },
          animate: { opacity: 1, y: 0 },
          transition: { ...RISE.t, delay: order * RISE.stagger },
        };

  return (
    // The document scrolls in its own container below (not the root) so the
    // fixed chrome (header, tick rail) can layer over it cleanly.
    // color-scheme: the app body declares dark (dark scrollbars/controls for
    // the dashboard shell) — override on this white canvas or the browser
    // paints a dark scrollbar track down the light page. In dark the canvas
    // deepens to the same Figma LOGIN/DARK #171717 as /login (shared public
    // vocabulary — the two pages must read as one place in both schemes) and
    // the scrollbar follows the scheme.
    <div className="overview-light relative h-dvh overflow-hidden bg-white dark:bg-[#171717] antialiased [color-scheme:light] dark:[color-scheme:dark]">
      {/* Top bar — same geometry as /login so the two pages read as one place.
          Fixed (not scrolled away) with a scroll-edge material: transparent at
          rest, a translucent blur layer + canonical hairline once document
          content actually passes beneath it — chrome only materializes when
          there's something to separate from. */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8',
          // Same name as /login's bar. The two are pixel-identical, so across the
          // boundary the browser has nothing to interpolate and the bar simply
          // holds still while the page changes under it — one persistent frame
          // around two pages, rather than two pages that happen to match.
          '[view-transition-name:public-chrome]',
          'transition-[background-color,box-shadow] duration-200 ease-out',
          scrolledUnder
            ? 'bg-white/80 dark:bg-[#171717]/80 backdrop-blur-[20px] backdrop-saturate-150 shadow-seeko contrast-more:bg-white dark:contrast-more:bg-[#171717]'
            : 'bg-transparent',
        )}
      >
        {/* The press dims PAST the hover (0.45 vs 0.70) so a click on an already-
            hovered mark still reads as a change. Held through the lazy /login
            chunk by `data-[pending]`, so the gesture doesn't go dead mid-fetch. */}
        <PublicLink
          to="/login"
          className={cn(
            'flex items-center gap-2.5',
            TOUCH_TARGET,
            'transition-opacity duration-150 ease-out hover:opacity-70 active:opacity-45 active:duration-[60ms] data-[pending]:opacity-45',
          )}
        >
          {/* Dark chrome mirrors /login — including its fix. Both pages pinned
              these labels to #3e3e3e from Figma LOGIN/DARK as "recessive chrome";
              on the shared #171717 canvas that measures 1.68:1, under WCAG's 3:1
              floor for a *graphic*, never mind the 4.5:1 a 16px label needs. Light
              already resolved through the ramp (ink-muted-strong), so the pin only
              ever sat on the dark half — a light lightness carried into dark.
              ink-faint (#949494, 5.91:1) is the dimmest dark tier that still clears
              AA, so the recessive intent survives. brightness() multiplies the sRGB
              value directly: 110 × 1.35 ≈ 148, landing the mark on the same tier. */}
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6 dark:brightness-[1.35]" />
          <span className="text-base font-medium text-ink-muted-strong dark:text-ink-faint">Studio</span>
        </PublicLink>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20legal%20question"
          className={cn(
            'flex items-center gap-2 text-base text-ink-muted-strong dark:text-ink-faint',
            TOUCH_TARGET,
            'transition-colors duration-150 hover:text-ink active:text-ink-title',
          )}
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
          row. Dragging past either end rubberbands the whole rail (damped
          1:1 stretch, spring home on release) — the physical stop that says
          you're at the first/last section. The press only becomes a drag once it crosses into another row,
          so a stationary press still falls through to the button's onClick
          (and its smooth scroll). Pointer capture starts at the same moment,
          which also swallows the synthetic click that would otherwise
          re-jump. */}
      <motion.nav
        aria-label="Sections"
        // Named so the rail belongs to the PAGE, not to the document: on a
        // sibling swap it cross-fades in place (the tick count changes) instead
        // of blinking out with the body it doesn't belong to.
        className="fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 print:hidden xl:block sm:left-10 [view-transition-name:legal-rail]"
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => {
          setRailHovered(false);
          setPeekedSection(null);
        }}
        {...(reduceMotion || arrivedViaTransition
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
          // Rubberband displacement rides alongside the engaged scale (motion
          // composes the style motion value with the animated transform).
          style={{ y: railShift }}
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
              slipped: false,
            };
          }}
          onPointerMove={e => {
            const drag = dragRef.current;
            if (!drag || e.pointerId !== drag.pointerId) return;
            // A move with no primary button/contact down means the release
            // happened where we couldn't see it (pointerup landed off-element
            // before capture began, or capture was lost). Abandon the press —
            // otherwise a later buttonless hover across the rail would start
            // a phantom drag that no pointerup ever ends, scrubbing the page
            // on mouse movement and locking scroll until a stray click.
            if (!(e.buttons & 1)) {
              dragRef.current = null;
              if (drag.dragging) {
                setRailDragging(false);
                releaseRailShift();
              }
              return;
            }
            if (!drag.dragging) {
              if (railIndexAt(e.clientY) === drag.startIndex) return;
              drag.dragging = true;
              drag.tops = measureSectionTops();
              setRailDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              startScrubGlide();
              // Re-grabbed mid-return: the hand takes over from wherever the
              // spring left the rail — scrubMove writes the value from here.
              railShiftReturn.current?.stop();
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
                    ? tick.active
                    : peekedSection === i
                      ? tick.peeked
                      : railEngaged
                        ? tick.engaged
                        : tick.rest,
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
                peekedSection === activeSection
                  ? 'font-medium text-[#1c1c1c] dark:text-[#e4e4e4]'
                  : 'text-[#5f5f5f] dark:text-[#a3a3a3]',
              )}
            >
              <span className="truncate whitespace-nowrap">{doc.sections[peekedSection].heading}</span>
            </motion.span>
          )}
        </AnimatePresence>
        </motion.div>
      </motion.nav>

      {/* The document itself — header (z-20) and rail (z-10) stay above it. */}
      <div
        ref={scrollerRef}
        className="relative z-[1] h-full overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges]"
      >
      {/* Overscroll translate rides the whole document (transform-only, so
          scrollTop and the glide loop are untouched) — the dial's overshoot
          carries the page a little further past its end, then frame-locks. */}
      {/* `legal-doc` — the document column, one name across all three docs. On a
          sibling swap the old body sinks out while the new one rises in; on the
          way to /login it sinks and the sign-in panel comes forward. Same name
          on both sides is safe here precisely because the column's width and top
          edge are fixed and only its height differs (see globals.css). */}
      <motion.main
        className="mx-auto w-full max-w-[680px] pb-24 pt-32 sm:pt-36 [view-transition-name:legal-doc]"
        style={{ y: pageShift }}
      >
        {/* Document switcher — pill per document, current one filled. Named, so
            it's lifted out of the column's snapshot and holds its position
            through a sibling swap: a tab strip that jumps when you press it is a
            tab strip that feels broken. */}
        {/* gap-y is 12px, not 6px, and that is load-bearing rather than taste.
            The pills are 32px tall and their hit areas are extended to the 44px
            touch minimum — 6px past each edge. On a phone this row WRAPS (the
            three pills measure 438px; every iPhone is narrower), and at the old
            6px row gap the two rows' extended areas would have overlapped by
            exactly 6px: a thumb landing in that band hits whichever pill happens
            to paint last. 12px is the smallest gap at which they tile without
            colliding. It only ever applies when wrapped, so the desktop row is
            unchanged to the pixel. */}
        <motion.nav
          aria-label="Legal documents"
          className="flex flex-wrap gap-x-1.5 gap-y-3 [view-transition-name:legal-switcher]"
          {...rise(0)}
        >
          {DOCS.map(d => (
            <PublicLink
              key={d.slug}
              to={`/legal/${d.slug}`}
              aria-current={d.slug === doc.slug ? 'page' : undefined}
              className={cn(
                // These ARE buttons, so they get the house press: scale(0.96),
                // fast in / gentle out. Unlike the footnote's text links they're
                // their own block, so a transform costs no layout. The sibling
                // swap is same-chunk and instant, so `data-[pending]` will
                // effectively never light up here — it's carried anyway so the
                // pills don't become the one public link that can go dead if the
                // legal route is ever split further.
                'inline-block rounded-full px-3.5 py-1.5 text-[13px] font-medium',
                TOUCH_TARGET,
                'transition-[color,background-color,transform,opacity] duration-150 ease-out',
                'active:scale-[0.96] active:duration-[60ms] data-[pending]:opacity-70',
                d.slug === doc.slug
                  ? 'bg-control-fill text-ink'
                  // dark:text-ink-faint is not cosmetic: without it the LIGHT
                  // #909090 leaked into dark and only *happened* to land near
                  // the dark faint tier (L .653 vs .668). Anchored, the two
                  // schemes stop being coupled — retuning light can no longer
                  // silently break dark. (Its light 3.5:1 on white is below
                  // this project's own #767676 AA floor for an interactive
                  // label — flagged, not changed: that's an extracted value.)
                  : 'text-[#909090] dark:text-ink-faint hover:bg-surface-3 hover:text-[#5f5f5f] dark:hover:text-[#b0b0b0]',
              )}
            >
              {d.shortTitle}
            </PublicLink>
          ))}
        </motion.nav>

        <motion.div className="mt-8" {...rise(1)}>
          <h1 className="text-balance text-[28px] font-semibold tracking-[-0.02em] text-[#1c1c1c] dark:text-[#e4e4e4]">
            {doc.title}
          </h1>
          <p className="mt-2 text-[13px] font-medium tabular-nums text-[#767676] dark:text-[#959595] contrast-more:text-ink">
            Effective {doc.effectiveDate}
          </p>
          <p className="mt-5 text-pretty text-base leading-relaxed text-ink-muted-strong">{doc.intro}</p>
        </motion.div>

        {/* Contents — quick anchors for screens too narrow for the tick rail;
            numbers in tabular figures so the column aligns */}
        <motion.nav
          aria-label="Contents"
          className="mt-9 rounded-2xl bg-[#fafafa] dark:bg-[#1f1f1f] px-5 py-4 xl:hidden"
          {...rise(2)}
        >
          <p className="text-[13px] font-semibold text-ink">Contents</p>
          <ol className="mt-2.5 columns-1 gap-8 sm:columns-2">
            {doc.sections.map((section, i) => (
              <li key={i} className="break-inside-avoid">
                <a
                  href={`#${sectionId(i, section.heading)}`}
                  className="flex gap-2 py-[3px] text-[13.5px] leading-snug text-ink-muted-strong transition-colors duration-150 hover:text-ink-title"
                >
                  {/* Light #b0b0b0 IS the faintest tier (#b3b3b3). Its dark
                      counterpart was #5c5c5c — L .475, a tier BELOW ink-ghost
                      (.520), which is the ramp's graphic-only floor. A list
                      ordinal you're meant to read cannot live under the floor.
                      Light is untouched; dark now resolves the same tier. */}
                  <span className="w-5 shrink-0 tabular-nums text-[#b0b0b0] dark:text-ink-faintest">{i + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </motion.nav>

        <motion.article className="mt-12 space-y-10" {...rise(3)}>
          {doc.sections.map((section, i) => (
            <section key={i} id={sectionId(i, section.heading)} className="scroll-mt-28">
              <h2 className="flex gap-3 text-[16px] font-semibold text-[#1c1c1c] dark:text-[#e4e4e4]">
                {/* Section count. Light #c0c0c0 is the ink-ghost tier (#c4c4c4)
                    — "graphic only: counts, chevrons", exactly this. Dark was
                    #525252 (L .439), well under the ghost floor (.520). */}
                <span className="tabular-nums text-[#c0c0c0] dark:text-ink-ghost">{i + 1}</span>
                {section.heading}
              </h2>
              {/* The per-section "In short" gist that used to sit here was
                  REMOVED by user order (2026-07-12), along with the `summary`
                  field that fed it. The doc-level `intro` under the title is a
                  separate thing and stays. */}
              <div className="mt-3 space-y-3 pl-[30px]">
                {section.body.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </div>
            </section>
          ))}
        </motion.article>

        <motion.footer
          className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] dark:border-[#2a2a2a] pt-6"
          {...rise(4)}
        >
          <p className="text-[13px] text-[#767676] dark:text-[#959595] contrast-more:text-ink">SEEKO Studio</p>
          <PublicLink
            to="/login"
            className={cn(
              'text-[13px] font-medium text-ink-muted-strong',
              TOUCH_TARGET,
              'transition-[color,opacity] duration-150 ease-out hover:text-ink-title active:opacity-55 active:duration-[60ms] data-[pending]:opacity-55',
            )}
          >
            Back to sign in
          </PublicLink>
        </motion.footer>
      </motion.main>
      </div>
    </div>
  );
}
